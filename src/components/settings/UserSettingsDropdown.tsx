import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Settings, LogOut, Bell, Moon, Sun, Monitor } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from 'next-themes';

interface UserSettings {
  stayLoggedIn: boolean;
  notifications: boolean;
  compactMode: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  stayLoggedIn: true,
  notifications: true,
  compactMode: false,
};

export const UserSettingsDropdown = () => {
  const { signOut, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem('userSettings');
    if (savedSettings) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
      } catch {
        // Use defaults if parse fails
      }
    }
  }, []);

  // Save settings to localStorage whenever they change
  const updateSetting = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    localStorage.setItem('userSettings', JSON.stringify(newSettings));
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const getThemeIcon = () => {
    if (theme === 'dark') return <Moon className="h-4 w-4" />;
    if (theme === 'light') return <Sun className="h-4 w-4" />;
    return <Monitor className="h-4 w-4" />;
  };

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Settings className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 tech-border">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">Settings</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {/* Stay Logged In */}
        <div className="flex items-center justify-between px-2 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">Stay Logged In</span>
          </div>
          <Switch
            checked={settings.stayLoggedIn}
            onCheckedChange={(checked) => updateSetting('stayLoggedIn', checked)}
          />
        </div>

        {/* Notifications */}
        <div className="flex items-center justify-between px-2 py-2">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Notifications</span>
          </div>
          <Switch
            checked={settings.notifications}
            onCheckedChange={(checked) => updateSetting('notifications', checked)}
          />
        </div>

        {/* Compact Mode */}
        <div className="flex items-center justify-between px-2 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">Compact Mode</span>
          </div>
          <Switch
            checked={settings.compactMode}
            onCheckedChange={(checked) => updateSetting('compactMode', checked)}
          />
        </div>

        <DropdownMenuSeparator />

        {/* Theme Selection */}
        <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
        <div className="flex gap-1 px-2 py-2">
          <Button
            variant={theme === 'light' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setTheme('light')}
            className="flex-1"
          >
            <Sun className="h-3 w-3 mr-1" />
            Light
          </Button>
          <Button
            variant={theme === 'dark' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setTheme('dark')}
            className="flex-1"
          >
            <Moon className="h-3 w-3 mr-1" />
            Dark
          </Button>
          <Button
            variant={theme === 'system' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setTheme('system')}
            className="flex-1"
          >
            <Monitor className="h-3 w-3 mr-1" />
            Auto
          </Button>
        </div>

        <DropdownMenuSeparator />

        {/* Sign Out */}
        <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
