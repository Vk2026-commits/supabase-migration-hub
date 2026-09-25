import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Award, Video, Lock, Users, CheckCircle2, Building2, User, QrCode } from "lucide-react";
import { Link } from "@/lib/router-compat";
import Navbar from "@/components/Navbar";
import JobListings from "@/components/JobListings";
import { useTranslation } from "react-i18next";
import QRCode from "react-qr-code";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const Index = () => {
  const { t } = useTranslation();
  
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto w-full max-w-full px-4 py-8">
        <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            {/* Hero Section */}
            <section className="relative min-w-0 overflow-hidden py-12 sm:py-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(var(--primary)/0.1),transparent_50%)]" />
        <div className="relative mx-auto w-full min-w-0 max-w-6xl">
          <div className="min-w-0 space-y-6 text-center">
            <div className="mx-auto mb-4 inline-flex max-w-full items-center justify-center gap-2 rounded-full border border-primary/20 bg-secondary/50 px-3 py-2 sm:px-4">
              <Shield className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 text-sm font-medium leading-snug">{t('hero.badge')}</span>
            </div>
            
            <h1 className="max-w-full break-words text-3xl font-bold leading-tight tracking-normal sm:text-5xl md:text-6xl">
              {t('hero.title')}
              <span className="block mt-2 pb-2 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                {t('hero.titleHighlight')}
              </span>
            </h1>
            
            <p className="mx-auto max-w-2xl break-words text-base leading-relaxed text-muted-foreground sm:text-xl">
              {t('hero.subtitle')}
            </p>
            
            <Dialog>
              <DialogTrigger asChild>
                <p className="mx-auto max-w-2xl cursor-pointer break-words text-base font-medium leading-relaxed text-primary hover:underline sm:text-lg">
                  {t('hero.freeProfessionals')}
                </p>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{t('roleSelection.title')}</DialogTitle>
                  <DialogDescription>
                    {t('roleSelection.description')}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 gap-4 py-4">
                  <Link to="/get-started" className="w-full">
                    <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
                      <User className="w-8 h-8" />
                      <span className="font-semibold">{t('roleSelection.officer')}</span>
                      <span className="text-xs text-muted-foreground">{t('roleSelection.officerSubtitle')}</span>
                    </Button>
                  </Link>
                  <Link to="/auth?role=company" className="w-full">
                    <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
                      <Building2 className="w-8 h-8" />
                      <span className="font-semibold">{t('roleSelection.company')}</span>
                      <span className="text-xs text-muted-foreground">{t('roleSelection.companySubtitle')}</span>
                    </Button>
                  </Link>
                </div>
              </DialogContent>
            </Dialog>
            
            <div className="flex min-w-0 flex-col justify-center gap-4 pt-4 sm:flex-row">
              <Button size="lg" asChild className="h-auto min-h-12 w-full max-w-full whitespace-normal px-4 py-3 text-base leading-snug sm:w-auto sm:px-8 sm:text-lg">
                <Link to="/get-started" className="text-center">Security Professionals Create Your Profile</Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="h-auto min-h-12 w-full max-w-full whitespace-normal px-4 py-3 text-base leading-snug sm:w-auto sm:px-8 sm:text-lg">
                <Link to="/auth?role=company" className="text-center">Create Your Company Profile For Companies</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

            {/* Disclaimer Section */}
            <section className="py-8">
              <Card className="border-2 border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
                <CardContent className="pt-6">
                   <div className="flex min-w-0 gap-3 sm:gap-4">
                    <div className="flex-shrink-0">
                      <div className="h-12 w-12 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <Shield className="h-6 w-6 text-amber-600 dark:text-amber-500" />
                      </div>
                    </div>
                     <div className="min-w-0 flex-1 break-words">
                      <h3 className="text-xl font-semibold mb-3 text-amber-900 dark:text-amber-100">
                        Important Notice for Security Companies
                      </h3>
                      <div className="space-y-2 text-amber-800 dark:text-amber-200">
                        <p className="flex items-start gap-2">
                          <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                          <span>This platform is designed exclusively for licensed security companies seeking to hire qualified security officers.</span>
                        </p>
                        <p className="flex items-start gap-2">
                          <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                          <span>You must possess a valid security company license to post job openings and hire security officers through our platform.</span>
                        </p>
                        <p className="flex items-start gap-2">
                          <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
                          <span>All security officers must be properly associated with a licensed security company to be eligible for employment.</span>
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Features Section */}
            <section className="min-w-0 rounded-lg bg-muted/30 py-14 sm:py-20">
        <div className="mx-auto w-full min-w-0 max-w-6xl px-3 sm:px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {t('features.title')}
            </h2>
            <p className="text-muted-foreground text-lg">
              {t('features.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{t('features.profiles.title')}</h3>
                <p className="text-muted-foreground">
                  {t('features.profiles.description')}
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Video className="h-6 w-6 text-primary" />
                </div>
              <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
                  <h3 className="text-xl font-semibold">{t('features.video.title')}</h3>
                  <span className="px-2 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full">Coming Soon</span>
                </div>
                <p className="text-muted-foreground">
                  {t('features.video.description')}
                </p>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-primary/50 transition-colors">
              <CardContent className="pt-6">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Award className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{t('features.certifications.title')}</h3>
                <p className="text-muted-foreground">
                  {t('features.certifications.description')}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

            {/* CTA Section */}
            <section className="min-w-0 rounded-lg bg-gradient-to-br from-primary to-primary/80 px-4 py-14 text-primary-foreground sm:py-20">
        <div className="mx-auto w-full min-w-0 max-w-4xl text-center">
          <h2 className="mb-4 break-words text-2xl font-bold sm:text-3xl md:text-4xl">
            {t('cta.title')}
          </h2>
          <p className="mb-8 break-words text-base leading-relaxed opacity-90 sm:text-xl">
            Join hundreds of security professionals and companies already using
            <br className="hidden sm:block" />
            We Find Guards
          </p>
           <div className="flex min-w-0 flex-col justify-center gap-4 sm:flex-row">
             <Button size="lg" variant="secondary" asChild className="h-auto min-h-12 w-full max-w-full whitespace-normal px-4 py-3 text-base sm:w-auto sm:px-8 sm:text-lg">
              <Link to="/auth?mode=signup">{t('cta.createAccount')}</Link>
            </Button>
             <Button size="lg" variant="outline" asChild className="h-auto min-h-12 w-full max-w-full whitespace-normal border-2 border-primary-foreground bg-transparent px-4 py-3 text-base text-primary-foreground hover:bg-primary-foreground hover:text-primary sm:w-auto sm:px-8 sm:text-lg">
              <Link to="/browse">{t('cta.exploreProfiles')}</Link>
            </Button>
          </div>
        </div>
      </section>

            {/* QR Code Section */}
            <section className="py-16">
              <div className="mx-auto w-full min-w-0 max-w-4xl">
                <Card className="border-2 border-primary/20 bg-gradient-to-br from-background to-muted/30">
                  <CardContent className="pt-8 pb-8">
                     <div className="flex min-w-0 flex-col items-center gap-8 md:flex-row">
                       <div className="min-w-0 flex-1 break-words text-center md:text-left">
                        <h2 className="text-2xl font-bold mb-4">
                          Scan to Get Started
                        </h2>
                        <p className="text-muted-foreground mb-4">
                          Use this QR code to quickly access our platform from any device.
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Scan with your phone's camera to create an account or log in instantly.
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        <div className="p-4 bg-white rounded-lg shadow-lg">
                          <QRCode
                            value={`${window.location.origin}/auth`}
                            size={150}
                            level="H"
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

          </div>

          {/* Job Listings Sidebar */}
          <aside className="min-w-0 lg:sticky lg:top-8 lg:self-start">
            <JobListings />
          </aside>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4">
        <div className="container mx-auto max-w-6xl text-center text-muted-foreground">
          <p className="mb-2">{t('footer.copyright')}</p>
          <div className="flex justify-center gap-4 text-sm">
            <Link to="/privacy" className="hover:text-primary transition-colors">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
