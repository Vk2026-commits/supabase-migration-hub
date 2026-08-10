import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "@/lib/router-compat";
import { z } from "zod";

// Password validation schema
const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one capital letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special symbol");

const usernameSchema = z.string()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be less than 20 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores");

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "signin";
  const urlRole = searchParams.get("role");
  
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<"officer" | "company">(
    (urlRole === "officer" || urlRole === "company") ? urlRole : "officer"
  );
  const [loading, setLoading] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);

  useEffect(() => {
    // Check if user is already logged in
    const force = searchParams.get("force");
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !force) {
        navigate("/dashboard");
      }
    });
  }, [navigate, searchParams]);

  const validatePassword = (pwd: string) => {
    const errors: string[] = [];
    try {
      passwordSchema.parse(pwd);
      setPasswordErrors([]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(e => e.message);
        setPasswordErrors(errorMessages);
        return false;
      }
    }
    return true;
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setPasswordErrors([]);

    try {
      if (mode === "signup") {
        // Validate password
        if (!validatePassword(password)) {
          setLoading(false);
          return;
        }

        // Validate username
        try {
          usernameSchema.parse(username);
        } catch (error) {
          if (error instanceof z.ZodError) {
            toast.error(error.errors[0].message);
            setLoading(false);
            return;
          }
        }

        // Check if email is valid
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailOrUsername)) {
          toast.error("Please enter a valid email address");
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.signUp({
          email: emailOrUsername,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              full_name: fullName,
              username: username,
              role: role,
            },
          },
        });

        if (error) throw error;
        
        toast.success("Account created successfully! Redirecting...");
        setTimeout(() => navigate("/dashboard"), 1000);
      } else {
        // Sign in - check if input is email or username
        const isEmail = emailOrUsername.includes('@');
        
        if (isEmail) {
          // Sign in with email
          const { error } = await supabase.auth.signInWithPassword({
            email: emailOrUsername,
            password,
          });

          if (error) throw error;
        } else {
          // Sign in with username - first get email from profiles
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('email')
            .eq('username', emailOrUsername)
            .single();

          if (profileError || !profile) {
            throw new Error("Username not found");
          }

          const { error } = await supabase.auth.signInWithPassword({
            email: profile.email,
            password,
          });

          if (error) throw error;
        }
        
        toast.success("Signed in successfully!");
        navigate("/dashboard");
      }
    } catch (error: any) {
      toast.error(error.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!emailOrUsername) {
      toast.error("Please enter your email address first");
      return;
    }
    
    // Check if input looks like an email
    const isEmail = emailOrUsername.includes('@');
    if (!isEmail) {
      toast.error("Please enter your email address (not username)");
      return;
    }
    
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailOrUsername, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      
      if (error) throw error;
      
      toast.success("Password reset link sent to your email!");
    } catch (error: any) {
      toast.error(error.message || "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <Link to="/" className="flex items-center gap-2">
              <Shield className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                We Find Guards
              </span>
            </Link>
          </div>
          <CardTitle className="text-2xl text-center">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </CardTitle>
          <CardDescription className="text-center">
            {mode === "signin" 
              ? "Sign in to access your account" 
              : "Join the premier security professional marketplace"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="johndoe"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    3-20 characters, letters, numbers, and underscores only
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>I am a...</Label>
                  <RadioGroup value={role} onValueChange={(value) => setRole(value as "officer" | "company")}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="officer" id="officer" />
                      <Label htmlFor="officer" className="font-normal cursor-pointer">
                        Security Officer
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="company" id="company" />
                      <Label htmlFor="company" className="font-normal cursor-pointer">
                        Hiring Company
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="emailOrUsername">
                {mode === "signup" ? "Email" : "Email or Username"}
              </Label>
              <Input
                id="emailOrUsername"
                type={mode === "signup" ? "email" : "text"}
                placeholder={mode === "signup" ? "your@email.com" : "email or username"}
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (mode === "signup") {
                    validatePassword(e.target.value);
                  }
                }}
                required
                minLength={8}
              />
              {mode === "signup" && (
                <div className="text-xs space-y-1">
                  <p className="text-muted-foreground">Password must contain:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                    <li className={password.length >= 8 ? "text-green-600" : ""}>
                      At least 8 characters
                    </li>
                    <li className={/[A-Z]/.test(password) ? "text-green-600" : ""}>
                      One capital letter
                    </li>
                    <li className={/[0-9]/.test(password) ? "text-green-600" : ""}>
                      One number
                    </li>
                    <li className={/[^A-Za-z0-9]/.test(password) ? "text-green-600" : ""}>
                      One special symbol (!@#$%^&*)
                    </li>
                  </ul>
                  {passwordErrors.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {passwordErrors.map((error, index) => (
                        <p key={index} className="text-destructive text-xs">{error}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Loading..." : mode === "signin" ? "Sign In" : "Create Account"}
            </Button>

            {mode === "signin" && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={loading}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            <div className="text-center text-sm">
              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="text-primary hover:underline"
              >
                {mode === "signin" 
                  ? "Don't have an account? Sign up" 
                  : "Already have an account? Sign in"}
              </button>
            </div>
          </form>
          
          {/* Show pricing for companies */}
          {mode === "signup" && role === "company" && (
            <div className="mt-6 space-y-4">
              <div className="text-center space-y-3">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
                  <span className="text-sm font-semibold text-primary">🎉 Free for the First 30 Days</span>
                </div>
                <h3 className="text-lg font-semibold">Choose Your Plan</h3>
                <p className="text-sm text-muted-foreground">Select the plan that best fits your hiring needs</p>
              </div>
              
              <div className="space-y-3">
                <Card className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-semibold">Free</h4>
                      <p className="text-sm text-muted-foreground">Basic browsing</p>
                    </div>
                    <span className="font-bold">$0</span>
                  </div>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    <li>• View officer profiles</li>
                    <li>• Basic information access</li>
                    <li>• Search functionality</li>
                  </ul>
                </Card>
                
                <Card className="p-4 border-2 border-primary">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">Professional</h4>
                        <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded-full">Popular</span>
                      </div>
                      <p className="text-sm text-muted-foreground">30-day free trial</p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold">$19.99</span>
                      <p className="text-xs text-muted-foreground">per month</p>
                    </div>
                  </div>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    <li>• Everything in Free</li>
                    <li>• Full officer names</li>
                    <li>• Direct messaging</li>
                    <li>• Job posting management</li>
                  </ul>
                </Card>
                
                <Card className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-semibold">Premium</h4>
                      <p className="text-sm text-muted-foreground">Full access</p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold">$29.99</span>
                      <p className="text-xs text-muted-foreground">per month</p>
                    </div>
                  </div>
                  <ul className="text-xs space-y-1 text-muted-foreground">
                    <li>• Everything in Professional</li>
                    <li>• Full certification access</li>
                    <li>• Video interview viewing</li>
                    <li>• Work history details</li>
                  </ul>
                </Card>
              </div>
              
              <p className="text-xs text-center text-muted-foreground">
                You can upgrade or change plans after signing up
              </p>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
