import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export default function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out ${
        scrolled
          ? 'bg-navy-900/70 backdrop-blur-md border-b border-white/10 shadow-lg shadow-black/20'
          : 'bg-transparent border-b border-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 py-4">
        <nav className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-md overflow-hidden bg-navy-900 flex items-center justify-center transition-transform group-hover:scale-105">
              <img
                src="/fornexa-logo.jpeg"
                alt="FORNEXA"
                className="w-full h-full object-cover scale-[2.8]"
              />
            </div>
            <span className="text-white font-semibold text-lg tracking-tight">FORNEXA</span>
          </Link>

          <div className="flex items-center gap-6">
            <Link to="/dashboard" className="text-slate-300 text-sm font-medium hover:text-white transition-colors">
              Login
            </Link>
            <Link
              to="/dashboard"
              className="bg-white text-navy-900 px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-slate-100 transition-colors btn-transition"
            >
              Assinar agora
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}