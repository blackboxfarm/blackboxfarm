import React, { useState } from 'react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import featureStabilityScore from '@/assets/feature-stability-score.png';
import featureTop25Analysis from '@/assets/feature-top25-analysis.png';
import featureWhaleMovements from '@/assets/feature-whale-movements.png';
import aiInterpretationPreview from '@/assets/ai-interpretation-preview.png';

interface FeatureImage {
  src: string;
  alt: string;
  title: string;
}

const featureImages: FeatureImage[] = [
  {
    src: featureStabilityScore,
    alt: 'Stability Score & Security Alerts',
    title: 'Stability Score',
  },
  {
    src: featureTop25Analysis,
    alt: 'Top 25 Holders Analysis',
    title: 'Top 25 Analysis',
  },
  {
    src: featureWhaleMovements,
    alt: 'Real-Time Whale Movements',
    title: 'Whale Tracking',
  },
  {
    src: aiInterpretationPreview,
    alt: 'AI Interpretation - Structural insights, lifecycle detection, and key drivers',
    title: 'AI Analysis',
  },
];

export function FeatureThumbnailGallery() {
  const [selectedImage, setSelectedImage] = useState<FeatureImage | null>(null);

  return (
    <div className="flex justify-center gap-3 mt-4 mb-2">
      {featureImages.map((image, index) => (
        <Dialog key={index}>
          <DialogTrigger asChild>
            <div className="group cursor-pointer">
              <div className="relative w-20 h-14 md:w-24 md:h-16 rounded-lg overflow-hidden border border-primary/30 bg-muted/30 transition-all duration-300 group-hover:scale-110 group-hover:border-primary group-hover:shadow-lg group-hover:shadow-primary/20">
                <img
                  src={image.src}
                  alt={image.alt}
                  className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="absolute bottom-0 left-0 right-0 p-1 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <span className="text-[10px] font-medium text-foreground truncate block">
                    {image.title}
                  </span>
                </div>
              </div>
            </div>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] p-2">
            <div className="flex flex-col items-center gap-3">
              <img
                src={image.src}
                alt={image.alt}
                className="max-w-full max-h-[80vh] rounded-lg object-contain"
              />
              <p className="text-sm text-muted-foreground text-center">{image.alt}</p>
            </div>
          </DialogContent>
        </Dialog>
      ))}
    </div>
  );
}
