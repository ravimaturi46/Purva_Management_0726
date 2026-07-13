import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent } from './ui/card';
import { toast } from 'sonner';
import { Briefcase, Lock, Mail, ArrowLeft } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const { workspaceName, workspaceLogo, workspaceLogoFull, getDashboardColors } = useTheme();
  const themeColors = getDashboardColors();
  const displayLogo = workspaceLogoFull || workspaceLogo;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }
      
      toast.success('Logged in successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Please enter your email address');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });

      if (error) throw error;
      
      toast.success('Password reset link sent to your email!');
      setIsForgotPassword(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to send reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFFF0] dark:bg-[#0a0a0a] dark:bg-slate-950 dark:border-white/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-none shadow-xl rounded-3xl overflow-hidden">
        <div className={`p-8 text-center relative ${themeColors.solid}`}>
          {isForgotPassword && (
            <button 
              onClick={() => setIsForgotPassword(false)}
              className="absolute left-4 top-4 text-white/80 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="mx-auto mb-5 flex justify-center">
            {displayLogo ? (
              <div className="bg-white/95 dark:bg-white/90 p-3 rounded-2xl shadow-lg backdrop-blur-md">
                <img src={displayLogo} alt="Logo" className="h-[60px] w-auto max-w-[200px] object-contain drop-shadow-sm" />
              </div>
            ) : (
              <div className="w-16 h-16 bg-white/20 dark:bg-black/20 rounded-2xl flex items-center justify-center overflow-hidden backdrop-blur-md border border-white/20">
                <Briefcase className="w-8 h-8 text-white" />
              </div>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight break-words drop-shadow-sm">
            {isForgotPassword ? 'Reset Password' : workspaceName || 'Purva Vedic'}
          </h1>
          <p className="text-white/80 text-sm mt-2 font-medium">
            {isForgotPassword ? 'Enter your email to receive a reset link' : 'Project Management System'}
          </p>
        </div>
        
        <CardContent className="p-8">
          {isForgotPassword ? (
            <form onSubmit={handleResetPassword} className="space-y-6">
              <div className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    type="email"
                    placeholder="Email Address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-12 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 dark:border-slate-800 focus:bg-white dark:bg-slate-900 transition-colors"
                    required
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className={`w-full h-12 rounded-xl text-white font-bold text-sm shadow-md transition-all active:scale-[0.98] ${themeColors.solid}`}
                disabled={loading}
              >
                {loading ? 'Sending link...' : 'Send Reset Link'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    type="email"
                    placeholder="Email Address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-12 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus:bg-white dark:bg-slate-900 transition-colors"
                    required
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 h-12 rounded-xl bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus:bg-white dark:bg-slate-900 transition-colors"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsForgotPassword(true)}
                  className={`text-sm font-medium ${themeColors.text}`}
                >
                  Forgot Password?
                </button>
              </div>

              <Button 
                type="submit" 
                className={`w-full h-12 rounded-xl text-white font-bold text-sm shadow-md transition-all active:scale-[0.98] ${themeColors.solid}`}
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
