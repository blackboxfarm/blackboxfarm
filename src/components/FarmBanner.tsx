import { Bell, User } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export const FarmBanner = () => {
  const { user } = useAuth();

  return (
    <div className="relative">
      {/* Farm Banner */}
      <div className="relative h-48 bg-background overflow-hidden">
        <img 
          src="/farm-banner.svg" 
          alt="BlackBox Farm Banner" 
          className="w-full h-full object-cover"
        />
        
        {/* Header Content - Always Centered */}
        <div className="absolute inset-0 flex flex-col justify-center items-center z-10">
          <div className="flex items-center gap-3 mb-2">
            <img 
              src="/lovable-uploads/4caa07ef-479a-49fa-8f9f-c474607a99cd.png" 
              alt="BlackBox Farm Cube Logo" 
              className="w-12 h-12"
            />
            <h1 className="text-5xl font-bold text-cyan-400">
              BlackBox Farm
            </h1>
          </div>
          <p className="text-lg text-muted-foreground text-center">
            Putting the needle in the Haystack - Bumps for the whole Farm!
          </p>
        </div>

        {/* Top Right User Area */}
        <div className="absolute top-4 right-4 flex items-center gap-4">
          {/* Notification Icon */}
          <div className="relative">
            <Bell className="w-6 h-6 text-muted-foreground" />
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-xs text-white font-bold">2</span>
            </div>
          </div>
          
          {/* User Info */}
          {user ? (
            <div className="flex items-center gap-2 bg-background/80 backdrop-blur-sm rounded-lg px-3 py-2">
              <User className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm text-foreground">{user.email}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/auth" className="bg-background/80 backdrop-blur-sm text-foreground px-4 py-2 rounded-lg hover:bg-background/90 transition-colors">
                Sign In
              </Link>
              <Link to="/auth" className="bg-cyan-400 text-background px-4 py-2 rounded-lg hover:bg-cyan-500 transition-colors">
                Join BlackBox
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};