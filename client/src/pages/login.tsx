import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLogin } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap, Loader2 } from "lucide-react";
import { Redirect } from "wouter";
import { useUser } from "@/hooks/use-auth";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function Login() {
  const { toast } = useToast();
  const login = useLogin();
  const { data: user, isLoading } = useUser();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

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
          <div className="h-16 w-16 bg-primary rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-primary/25">
            <GraduationCap className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-display font-bold text-foreground">Welcome back</h1>
          <p className="text-muted-foreground mt-2">Enter your credentials to access your portal</p>
        </div>

        <Card className="border-0 shadow-2xl shadow-black/5 rounded-2xl overflow-hidden glass-panel">
          <CardHeader className="space-y-1 pb-6 px-8 pt-8">
            <CardTitle className="text-2xl">Sign In</CardTitle>
            <CardDescription>Use your school email and password.</CardDescription>
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
