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
      
      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-[1fr_300px] gap-8">
          <div>
            {/* Hero Section */}
            <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(var(--primary)/0.1),transparent_50%)]" />
        <div className="container mx-auto max-w-6xl relative">
          <div className="text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 border border-primary/20 mb-4">
              <Shield className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{t('hero.badge')}</span>
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
              {t('hero.title')}
              <span className="block mt-2 pb-2 bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                {t('hero.titleHighlight')}
              </span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              {t('hero.subtitle')}
            </p>
            
            <Dialog>
              <DialogTrigger asChild>
                <p className="text-lg font-medium text-primary max-w-2xl mx-auto cursor-pointer hover:underline">
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
                  <Link to="/auth?role=officer" className="w-full">
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
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button size="lg" asChild className="text-lg h-12 px-8">
                <Link to="/auth?role=officer">Security Professionals Create Your Profile</Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="text-lg h-12 px-8">
                <Link to="/auth?role=company">Create Your Company Profile For Companies</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

            {/* Disclaimer Section */}
            <section className="py-8">
              <Card className="border-2 border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
                <CardContent className="pt-6">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0">
                      <div className="h-12 w-12 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <Shield className="h-6 w-6 text-amber-600 dark:text-amber-500" />
                      </div>
                    </div>
                    <div className="flex-1">
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
            <section className="py-20 bg-muted/30 rounded-lg">
        <div className="container mx-auto max-w-6xl">
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
                <div className="flex items-center gap-2 mb-2">
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
            <section className="py-20 bg-gradient-to-br from-primary to-primary/80 text-primary-foreground rounded-lg">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('cta.title')}
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Join hundreds of security professionals and companies already using
            <br />
            We Find Guards
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" asChild className="text-lg h-12 px-8">
              <Link to="/auth?mode=signup">{t('cta.createAccount')}</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="text-lg h-12 px-8 bg-transparent border-2 border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary">
              <Link to="/browse">{t('cta.exploreProfiles')}</Link>
            </Button>
          </div>
        </div>
      </section>

            {/* QR Code Section */}
            <section className="py-16">
              <div className="container mx-auto max-w-4xl">
                <Card className="border-2 border-primary/20 bg-gradient-to-br from-background to-muted/30">
                  <CardContent className="pt-8 pb-8">
                    <div className="flex flex-col md:flex-row items-center gap-8">
                      <div className="flex-1 text-center md:text-left">
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
          <aside className="lg:sticky lg:top-8 lg:self-start">
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
