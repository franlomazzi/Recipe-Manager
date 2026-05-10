"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tv } from "lucide-react";
import { useKioskSettings } from "@/lib/hooks/use-kiosk-settings";

export function KioskModeManager() {
  const { settings, update } = useKioskSettings();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tv className="h-5 w-5 text-primary" />
          Kiosk Mode
        </CardTitle>
        <CardDescription>
          Per-device protections for tablets left on for long periods. Settings
          are stored on this device only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Pixel shifting */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Pixel shifting</Label>
            <p className="text-xs text-muted-foreground">
              Subtly nudges the screen content every 90 seconds to prevent
              burn-in on OLED displays.
            </p>
          </div>
          <Switch
            checked={settings.pixelShift.enabled}
            onCheckedChange={(v) =>
              update({
                ...settings,
                pixelShift: { enabled: Boolean(v) },
              })
            }
          />
        </div>

        {/* Auto theme */}
        <div className="space-y-3 border-t pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Auto theme</Label>
              <p className="text-xs text-muted-foreground">
                Switch between light and dark theme based on the time of day.
                Manually picking a theme overrides until the next scheduled
                flip.
              </p>
            </div>
            <Switch
              checked={settings.autoTheme.enabled}
              onCheckedChange={(v) =>
                update({
                  ...settings,
                  autoTheme: { ...settings.autoTheme, enabled: Boolean(v) },
                })
              }
            />
          </div>
          {settings.autoTheme.enabled && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <Label className="text-xs">Light from</Label>
                <Input
                  type="time"
                  value={settings.autoTheme.lightStart}
                  onChange={(e) =>
                    update({
                      ...settings,
                      autoTheme: {
                        ...settings.autoTheme,
                        lightStart: e.target.value,
                      },
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Dark from</Label>
                <Input
                  type="time"
                  value={settings.autoTheme.darkStart}
                  onChange={(e) =>
                    update({
                      ...settings,
                      autoTheme: {
                        ...settings.autoTheme,
                        darkStart: e.target.value,
                      },
                    })
                  }
                />
              </div>
            </div>
          )}
        </div>

        {/* Screensaver */}
        <div className="space-y-3 border-t pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Idle screensaver</Label>
              <p className="text-xs text-muted-foreground">
                After a period of inactivity, replaces the screen with a
                drifting clock and your meal plan for today. Tap anywhere to
                dismiss.
              </p>
            </div>
            <Switch
              checked={settings.screensaver.enabled}
              onCheckedChange={(v) =>
                update({
                  ...settings,
                  screensaver: {
                    ...settings.screensaver,
                    enabled: Boolean(v),
                  },
                })
              }
            />
          </div>
          {settings.screensaver.enabled && (
            <div className="space-y-1 pt-1">
              <Label className="text-xs">Idle minutes before activating</Label>
              <Input
                type="number"
                min={1}
                max={120}
                value={settings.screensaver.idleMinutes}
                onChange={(e) =>
                  update({
                    ...settings,
                    screensaver: {
                      ...settings.screensaver,
                      idleMinutes: Math.max(
                        1,
                        Math.min(120, Number(e.target.value) || 10)
                      ),
                    },
                  })
                }
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
