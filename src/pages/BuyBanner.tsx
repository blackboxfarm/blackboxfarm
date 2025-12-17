import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Upload, ImageIcon, CalendarIcon, DollarSign, Clock, ArrowRight, AlertCircle, Check } from 'lucide-react';
import { format, addHours, startOfHour } from 'date-fns';
import { cn } from '@/lib/utils';

const PRICING = {
  24: { hours: 24, price: 40, label: '24 Hours', perDay: '$40/day' },
  48: { hours: 48, price: 70, label: '48 Hours', perDay: '$35/day' },
  72: { hours: 72, price: 100, label: '72 Hours', perDay: '$33/day' },
  168: { hours: 168, price: 175, label: '1 Week', perDay: '$25/day' },
};

const REQUIRED_WIDTH = 1500;
const REQUIRED_HEIGHT = 500;

export default function BuyBanner() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [twitter, setTwitter] = useState('');
  const [duration, setDuration] = useState<keyof typeof PRICING>(24);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [startHour, setStartHour] = useState<string>('12');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const validateImage = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const aspectRatio = img.width / img.height;
        const requiredRatio = REQUIRED_WIDTH / REQUIRED_HEIGHT; // 3:1
        
        // Allow some tolerance for aspect ratio
        if (Math.abs(aspectRatio - requiredRatio) > 0.1) {
          reject(new Error(`Image must be ${REQUIRED_WIDTH}x${REQUIRED_HEIGHT} (3:1 aspect ratio). Your image is ${img.width}x${img.height}`));
        } else {
          resolve({ width: img.width, height: img.height });
        }
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be less than 10MB');
      return;
    }

    try {
      const dimensions = await validateImage(file);
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setImageDimensions(dimensions);
      toast.success('Image uploaded successfully!');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const getScheduledStartTime = (): Date => {
    if (!startDate) return addHours(startOfHour(new Date()), 1);
    const date = new Date(startDate);
    date.setHours(parseInt(startHour), 0, 0, 0);
    return date;
  };

  const handleSubmit = async () => {
    if (!imageFile) {
      toast.error('Please upload a banner image');
      return;
    }
    if (!linkUrl) {
      toast.error('Please enter a destination URL');
      return;
    }
    if (!email) {
      toast.error('Please enter your email');
      return;
    }
    if (!title) {
      toast.error('Please enter a title for your banner');
      return;
    }

    // Validate URL
    try {
      new URL(linkUrl);
    } catch {
      toast.error('Please enter a valid URL (include https://)');
      return;
    }

    setIsSubmitting(true);

    try {
      // If not logged in, create account or prompt login
      if (!user) {
        toast.error('Please sign in to continue');
        navigate('/auth', { state: { returnTo: '/buy-banner' } });
        return;
      }

      // Upload image to storage
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('banner-images')
        .upload(fileName, imageFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('banner-images')
        .getPublicUrl(fileName);

      // Create order via edge function
      const { data, error } = await supabase.functions.invoke('banner-order-processor', {
        body: {
          imageUrl: publicUrl,
          linkUrl,
          title,
          email,
          twitter: twitter || null,
          durationHours: duration,
          priceUsd: PRICING[duration].price,
          startTime: getScheduledStartTime().toISOString(),
        },
      });

      if (error) throw error;

      toast.success('Order created! Redirecting to checkout...');
      navigate(`/banner-checkout/${data.orderId}`);
    } catch (error: any) {
      console.error('Error creating order:', error);
      toast.error(error.message || 'Failed to create order');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedPricing = PRICING[duration];

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Get Banner Space</h1>
          <p className="text-muted-foreground">
            Reach thousands of crypto traders with your banner ad
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left Column - Upload & Preview */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Upload Banner
                </CardTitle>
                <CardDescription>
                  Required size: {REQUIRED_WIDTH}x{REQUIRED_HEIGHT}px (3:1 ratio)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className={cn(
                    "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                    dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                    imagePreview && "border-green-500 bg-green-500/5"
                  )}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  
                  {imagePreview ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-center gap-2 text-green-500">
                        <Check className="h-5 w-5" />
                        <span className="font-medium">Image uploaded</span>
                      </div>
                      <img
                        src={imagePreview}
                        alt="Banner preview"
                        className="max-w-full rounded-lg shadow-lg"
                      />
                      {imageDimensions && (
                        <p className="text-sm text-muted-foreground">
                          {imageDimensions.width} x {imageDimensions.height}px
                        </p>
                      )}
                      <Button variant="outline" size="sm">
                        Change Image
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                      <div>
                        <p className="font-medium">Drop your image here</p>
                        <p className="text-sm text-muted-foreground">or click to browse</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        PNG, JPG, GIF, WebP up to 10MB
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Preview Banner in Context */}
            {imagePreview && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Live Preview</CardTitle>
                </CardHeader>
                <CardContent className="bg-muted/50 rounded-lg p-4">
                  <a href={linkUrl || '#'} target="_blank" rel="noopener noreferrer" className="block">
                    <img
                      src={imagePreview}
                      alt="Banner preview"
                      className="w-full rounded-lg shadow-md hover:shadow-lg transition-shadow"
                    />
                  </a>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    This is how your banner will appear on the site
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Details & Pricing */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Banner Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="title">Banner Title</Label>
                  <Input
                    id="title"
                    placeholder="My Awesome Project"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="linkUrl">Destination URL</Label>
                  <Input
                    id="linkUrl"
                    placeholder="https://your-website.com"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="email">Contact Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="twitter">Twitter/X Handle (optional)</Label>
                  <Input
                    id="twitter"
                    placeholder="@yourhandle"
                    value={twitter}
                    onChange={(e) => setTwitter(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Select Duration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={duration.toString()}
                  onValueChange={(v) => setDuration(parseInt(v) as keyof typeof PRICING)}
                  className="space-y-3"
                >
                  {Object.entries(PRICING).map(([hours, { label, price, perDay }]) => (
                    <div
                      key={hours}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-colors",
                        duration.toString() === hours ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                      )}
                      onClick={() => setDuration(parseInt(hours) as keyof typeof PRICING)}
                    >
                      <div className="flex items-center gap-3">
                        <RadioGroupItem value={hours} id={`duration-${hours}`} />
                        <Label htmlFor={`duration-${hours}`} className="cursor-pointer font-medium">
                          {label}
                        </Label>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lg">${price}</p>
                        <p className="text-xs text-muted-foreground">{perDay}</p>
                      </div>
                    </div>
                  ))}
                </RadioGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Start Time
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label>Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !startDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate ? format(startDate, 'PPP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={setStartDate}
                          disabled={(date) => date < new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="w-32">
                    <Label>Hour (UTC)</Label>
                    <Select value={startHour} onValueChange={setStartHour}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, i) => (
                          <SelectItem key={i} value={i.toString()}>
                            {i.toString().padStart(2, '0')}:00
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Your banner will run for {selectedPricing.label.toLowerCase()} starting from the selected time
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Summary & Submit */}
            <Card className="border-primary">
              <CardContent className="pt-6">
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration</span>
                    <span className="font-medium">{selectedPricing.label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price</span>
                    <span className="font-bold text-xl">${selectedPricing.price} USD</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Payable in SOL at current market rate
                  </p>
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !imageFile}
                  className="w-full"
                  size="lg"
                >
                  {isSubmitting ? (
                    'Processing...'
                  ) : (
                    <>
                      Continue to Payment
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}