import React from 'react';
import { Link } from 'react-router-dom';
import { SocialPredictor } from '@/components/socials/SocialPredictor';
import { ArrowLeft } from 'lucide-react';

const Socials = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Simple Header */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-xl font-bold">Socials</h1>
          </div>
        </div>
      </div>
      <main className="container mx-auto px-4 py-8">
        <SocialPredictor />
      </main>
    </div>
  );
};

export default Socials;
