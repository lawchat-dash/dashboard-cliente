import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Lock, Mail, Eye, EyeOff, LogIn, Loader2 } from 'lucide-react';

// Paleta oficial LawChat
const C_LIGHT = '#8ED393';
const C_DARK = '#15BF41';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signIn(email, password);
      navigate('/admin');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao fazer login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f7f8fa] flex items-center justify-center p-4">
      {/* Padrão de pontinhos sutilíssimo (sem mais blobs verdes gigantes) */}
      <div
        className="absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage: 'radial-gradient(rgba(15,23,42,0.05) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      />

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <div
          className="relative rounded-3xl border border-gray-200/80 bg-white overflow-hidden"
          style={{ boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.10), 0 0 0 1px rgba(15, 23, 42, 0.03)' }}
        >
          {/* Top accent gradient bar */}
          <div
            className="h-[3px]"
            style={{ background: `linear-gradient(90deg, transparent 5%, ${C_LIGHT} 35%, ${C_DARK} 65%, transparent 95%)` }}
          />

          <div className="p-10">
            {/* Logo + brand */}
            <div className="flex flex-col items-center mb-10">
              <motion.img
                src="/lawchat-logo-light-bg.png"
                alt="LawChat"
                className="h-16 mb-4"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-sm text-gray-500"
              >
                Painel Administrativo
              </motion.p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 }}>
                <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <Mail className="h-3.5 w-3.5 text-gray-400" />
                  Email
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="admin@empresa.com"
                  className="h-12 bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 transition-all"
                  onFocus={(e) => {
                    (e.target as HTMLElement).style.borderColor = C_DARK;
                    (e.target as HTMLElement).style.boxShadow = `0 0 0 3px ${C_LIGHT}33`;
                    (e.target as HTMLElement).style.backgroundColor = '#fff';
                  }}
                  onBlur={(e) => {
                    (e.target as HTMLElement).style.borderColor = '';
                    (e.target as HTMLElement).style.boxShadow = '';
                    (e.target as HTMLElement).style.backgroundColor = '';
                  }}
                />
              </motion.div>

              <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.55 }}>
                <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <Lock className="h-3.5 w-3.5 text-gray-400" />
                  Senha
                </label>
                <div className="relative">
                  <Input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="h-12 bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 pr-12 transition-all"
                    onFocus={(e) => {
                      (e.target as HTMLElement).style.borderColor = C_DARK;
                      (e.target as HTMLElement).style.boxShadow = `0 0 0 3px ${C_LIGHT}33`;
                      (e.target as HTMLElement).style.backgroundColor = '#fff';
                    }}
                    onBlur={(e) => {
                      (e.target as HTMLElement).style.borderColor = '';
                      (e.target as HTMLElement).style.boxShadow = '';
                      (e.target as HTMLElement).style.backgroundColor = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors"
                    tabIndex={-1}
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="group relative h-12 w-full overflow-hidden rounded-lg font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:translate-y-0"
                  style={{
                    background: `linear-gradient(135deg, ${C_LIGHT}, ${C_DARK})`,
                    boxShadow: `0 8px 16px -6px ${C_DARK}55`,
                  }}
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Entrando...
                      </>
                    ) : (
                      <>
                        <LogIn className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        Entrar no painel
                      </>
                    )}
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/25 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                </button>
              </motion.div>
            </form>

            {/* Footer */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.85 }}
              className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400"
            >
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: C_DARK }} />
                Sistema online
              </span>
              <span>v2.0</span>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
