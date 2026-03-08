import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin } from "@/hooks/use-auth";
import { usePublicSchoolSettings } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap, Loader2 } from "lucide-react";
import { Redirect } from "wouter";
import { useUser } from "@/hooks/use-auth";
import { applyDocumentBranding } from "@/lib/utils";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function Login() {
  const { toast } = useToast();
  const login = useLogin();
  const { data: user, isLoading } = useUser();
  const { data: publicSettings } = usePublicSchoolSettings();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    applyDocumentBranding(publicSettings, "Sign In");
  }, [publicSettings]);

  if (isLoading) return null;
  if (user) return <Redirect to={`/${user.role}`} />;

  const onSubmit = (data: z.infer<typeof loginSchema>) => {
    login.mutate(data, {
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Login Failed",
          description: error.message,
        });
      },
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Decorative background blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/30 rounded-full blur-[120px]" />

      <div className="w-full max-w-[420px] relative z-10">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="h-16 w-16 bg-primary rounded-2xl flex items-center justify-center mb-6 overflow-hidden shadow-xl shadow-primary/25">
            {publicSettings?.branding.logoUrl ? (
              <img src={publicSettings.branding.logoUrl} alt={publicSettings.schoolInformation.schoolName} className="h-full w-full object-cover" />
            ) : (
              <GraduationCap className="h-8 w-8 text-primary-foreground" />
            )}
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">{publicSettings?.schoolInformation.shortName || "School Nexus"}</p>
          <h1 className="text-3xl font-display font-bold text-foreground">{publicSettings?.branding.loginWelcomeTitle || "Welcome back"}</h1>
          <p className="text-muted-foreground mt-2">{publicSettings?.branding.loginWelcomeSubtitle || "Enter your credentials to access your portal"}</p>
          <p className="mt-3 text-sm text-slate-500">{publicSettings?.schoolInformation.motto || "Empowering every learner."}</p>
        </div>

        <Card className="border-0 shadow-2xl shadow-black/5 rounded-2xl overflow-hidden glass-panel">
          <CardHeader className="space-y-1 pb-6 px-8 pt-8">
            <CardTitle className="text-2xl">Sign In</CardTitle>
            <CardDescription>Use your school email and password to access {publicSettings?.schoolInformation.schoolName || "your school workspace"}.</CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground/80 font-medium">Email Address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="name@school.edu"
                          className="h-12 px-4 rounded-xl bg-slate-50/50 border-slate-200 focus-visible:ring-primary/20 focus-visible:ring-offset-2"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground/80 font-medium">Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          className="h-12 px-4 rounded-xl bg-slate-50/50 border-slate-200 focus-visible:ring-primary/20 focus-visible:ring-offset-2"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transition-all hover:-translate-y-0.5"
                  disabled={login.isPending}
                >
                  {login.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Sign In to Portal"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
