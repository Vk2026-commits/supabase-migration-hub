import { Link, useNavigate, useSearchParams } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { Shield, Languages } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Navbar = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [accountRoles, setAccountRoles] = useState<string[]>([]);

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAdminStatus(session.user.id);
        getUserRole(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAdminStatus(session.user.id);
        getUserRole(session.user.id);
      } else {
        setIsAdmin(false);
        setUserRole(null);
        setAccountRoles([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAdminStatus = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    
    setIsAdmin(!!data);
  };

  const getUserRole = async (userId: string) => {
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", userId).single(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    setUserRole(profile?.role ?? null);
    setAccountRoles(
      Array.from(new Set([profile?.role, ...(roles || []).map(({ role }) => role)]))
        .filter((role): role is string => role === "officer" || role === "company"),
    );
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const requestedRole = searchParams.get("viewAs");
  const activeRole =
    (requestedRole === "officer" || requestedRole === "company") &&
    accountRoles.includes(requestedRole)
      ? requestedRole
      : userRole;
  const hasOfficerAndCompanyAccess =
    accountRoles.includes("officer") && accountRoles.includes("company");

  return (
    <nav className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-semibold text-xl">
          <Shield className="h-6 w-6 text-primary" />
          <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            We Find Guards
          </span>
        </Link>

        <div className="flex items-center gap-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Languages className="h-4 w-4" />
                <span className="text-sm">{i18n.language === 'es' ? 'Español' : 'English'}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => changeLanguage('en')}>
                English
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => changeLanguage('es')}>
                Español
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {user ? (
            <>
              {activeRole !== "officer" && (
                <Button variant="ghost" asChild>
                  <Link to="/browse">{t('nav.browse')}</Link>
                </Button>
              )}
              <Button variant="ghost" asChild>
                <Link
                  to={
                    hasOfficerAndCompanyAccess &&
                    (activeRole === "officer" || activeRole === "company")
                      ? `/dashboard?viewAs=${activeRole}`
                      : "/dashboard"
                  }
                >
                  {t('nav.dashboard')}
                </Link>
              </Button>
              {isAdmin && (
                <>
                  <Button variant="ghost" asChild>
                    <Link to="/admin">Admin</Link>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">View as</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate("/dashboard?viewAs=officer")}>
                        Security Officer
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/dashboard?viewAs=company")}>
                        Company
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate("/admin")}>
                        Admin
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
              {hasOfficerAndCompanyAccess ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">Switch account</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => navigate("/dashboard?viewAs=officer")}>
                      Security Officer
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/dashboard?viewAs=company")}>
                      Company Team
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : activeRole !== "officer" && (
                <Button variant="ghost" asChild>
                  <Link to="/auth?force=1">Switch account</Link>
                </Button>
              )}
              <Button variant="outline" onClick={handleSignOut}>
                Sign Out
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link to="/browse">{t('nav.browse')}</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/auth">{t('nav.login')}</Link>
              </Button>
              <Button asChild>
                <Link to="/auth?mode=signup">{t('nav.signup')}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
