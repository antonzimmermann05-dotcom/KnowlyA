import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserCircle, Mail, Lock, AlertCircle, Loader2 } from "lucide-react";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthSuccess: (userData: UserData) => void;
}

export interface UserData {
  email: string;
  userId: string;
  isPremium: boolean;
  createdAt: Date;
}

const AUTH_STORAGE_KEY = "knowly-user-auth";

export function AuthDialog({ open, onOpenChange, onAuthSuccess }: AuthDialogProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password: string): boolean => {
    return password.length >= 6;
  };

  const handleLogin = async () => {
    setError("");
    setIsLoading(true);

    try {
      // Validate inputs
      if (!validateEmail(email)) {
        throw new Error("Bitte geben Sie eine gültige E-Mail-Adresse ein");
      }

      if (!validatePassword(password)) {
        throw new Error("Das Passwort muss mindestens 6 Zeichen lang sein");
      }

      // Check if user exists in localStorage
      const storedUsers = localStorage.getItem(AUTH_STORAGE_KEY);
      const users: Record<string, { password: string; userData: UserData }> = storedUsers
        ? JSON.parse(storedUsers)
        : {};

      const userEntry = users[email];

      if (!userEntry) {
        throw new Error("Kein Konto mit dieser E-Mail-Adresse gefunden");
      }

      if (userEntry.password !== password) {
        throw new Error("Falsches Passwort");
      }

      // Login successful
      const userData: UserData = {
        ...userEntry.userData,
        createdAt: new Date(userEntry.userData.createdAt),
      };

      onAuthSuccess(userData);
      onOpenChange(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login fehlgeschlagen");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async () => {
    setError("");
    setIsLoading(true);

    try {
      // Validate inputs
      if (!validateEmail(email)) {
        throw new Error("Bitte geben Sie eine gültige E-Mail-Adresse ein");
      }

      if (!validatePassword(password)) {
        throw new Error("Das Passwort muss mindestens 6 Zeichen lang sein");
      }

      if (password !== confirmPassword) {
        throw new Error("Die Passwörter stimmen nicht überein");
      }

      // Check if user already exists
      const storedUsers = localStorage.getItem(AUTH_STORAGE_KEY);
      const users: Record<string, { password: string; userData: UserData }> = storedUsers
        ? JSON.parse(storedUsers)
        : {};

      if (users[email]) {
        throw new Error("Ein Konto mit dieser E-Mail-Adresse existiert bereits");
      }

      // Create new user
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const userData: UserData = {
        email,
        userId,
        isPremium: false,
        createdAt: new Date(),
      };

      users[email] = {
        password,
        userData,
      };

      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(users));

      // Registration successful
      onAuthSuccess(userData);
      onOpenChange(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registrierung fehlgeschlagen");
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setError("");
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value as "login" | "register");
    setError("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <UserCircle className="h-6 w-6 text-blue-600" />
            Konto
          </DialogTitle>
          <DialogDescription>
            Melden Sie sich an oder erstellen Sie ein neues Konto
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Anmelden</TabsTrigger>
            <TabsTrigger value="register">Registrieren</TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="login-email">E-Mail-Adresse</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="login-email"
                  type="email"
                  placeholder="beispiel@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  disabled={isLoading}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="login-password">Passwort</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  disabled={isLoading}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleLogin}
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Wird angemeldet...
                </>
              ) : (
                "Anmelden"
              )}
            </Button>
          </TabsContent>

          <TabsContent value="register" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="register-email">E-Mail-Adresse</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="register-email"
                  type="email"
                  placeholder="beispiel@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="register-password">Passwort</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="register-password"
                  type="password"
                  placeholder="Mindestens 6 Zeichen"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Passwort bestätigen</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Passwort wiederholen"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10"
                  disabled={isLoading}
                  onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                />
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleRegister}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Wird erstellt...
                </>
              ) : (
                "Konto erstellen"
              )}
            </Button>

            <div className="text-center text-sm text-gray-500">
              Mit der Registrierung erstellen Sie ein kostenloses Konto
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
          <div className="text-xs text-gray-500 text-center w-full">
            Ihre Daten werden sicher lokal gespeichert
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Helper function to get current user
export function getCurrentUser(): UserData | null {
  const currentUserEmail = localStorage.getItem("knowly-current-user");
  if (!currentUserEmail) return null;

  const storedUsers = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!storedUsers) return null;

  try {
    const users: Record<string, { password: string; userData: UserData }> = JSON.parse(storedUsers);
    const userEntry = users[currentUserEmail];

    if (userEntry) {
      return {
        ...userEntry.userData,
        createdAt: new Date(userEntry.userData.createdAt),
      };
    }
  } catch (e) {
    console.error("Failed to load user:", e);
  }

  return null;
}

// Helper function to logout
export function logoutUser(): void {
  localStorage.removeItem("knowly-current-user");
}

// Helper function to update user premium status
export function updateUserPremiumStatus(email: string, isPremium: boolean): void {
  const storedUsers = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!storedUsers) return;

  try {
    const users: Record<string, { password: string; userData: UserData }> = JSON.parse(storedUsers);
    if (users[email]) {
      users[email].userData.isPremium = isPremium;
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(users));
    }
  } catch (e) {
    console.error("Failed to update premium status:", e);
  }
}
