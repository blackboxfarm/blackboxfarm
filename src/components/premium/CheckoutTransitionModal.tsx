import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Loader2, CheckCircle, CreditCard, Mail, UserCheck } from 'lucide-react';

interface CheckoutTransitionModalProps {
  isOpen: boolean;
  onComplete: () => void;
  isNewAccount?: boolean;
}

const steps = [
  { icon: UserCheck, label: 'Account created successfully', delay: 0 },
  { icon: Mail, label: 'Welcome email sent', delay: 1200 },
  { icon: CreditCard, label: 'Loading secure payment...', delay: 2400 },
];

const loginSteps = [
  { icon: UserCheck, label: 'Logged in successfully', delay: 0 },
  { icon: CreditCard, label: 'Loading secure payment...', delay: 1000 },
];

export function CheckoutTransitionModal({ isOpen, onComplete, isNewAccount = true }: CheckoutTransitionModalProps) {
  const [currentStep, setCurrentStep] = useState(-1);
  const activeSteps = isNewAccount ? steps : loginSteps;

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(-1);
      return;
    }

    // Start stepping through
    const timers: ReturnType<typeof setTimeout>[] = [];
    activeSteps.forEach((step, i) => {
      timers.push(setTimeout(() => setCurrentStep(i), step.delay + 400));
    });

    // Fire completion after last step + pause
    const totalTime = activeSteps[activeSteps.length - 1].delay + 1800;
    timers.push(setTimeout(onComplete, totalTime));

    return () => timers.forEach(clearTimeout);
  }, [isOpen, onComplete, isNewAccount, activeSteps]);

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md border-primary/30 bg-background/95 backdrop-blur-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="flex flex-col items-center py-6 space-y-6">
          {/* Animated logo/spinner */}
          <div className="relative">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
          </div>

          <h3 className="text-xl font-semibold text-foreground text-center">
            {isNewAccount ? 'Setting Up Your Account...' : 'Welcome Back!'}
          </h3>

          {/* Step indicators */}
          <div className="w-full space-y-3 px-4">
            {activeSteps.map((step, i) => {
              const StepIcon = step.icon;
              const isActive = currentStep >= i;
              const isCurrent = currentStep === i && i === activeSteps.length - 1;

              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 transition-all duration-500 ${
                    isActive ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
                  }`}
                >
                  {isActive && !isCurrent ? (
                    <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                  ) : isCurrent ? (
                    <Loader2 className="h-5 w-5 text-primary animate-spin flex-shrink-0" />
                  ) : (
                    <StepIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className={`text-sm ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Stripe payment will open in a new tab
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
