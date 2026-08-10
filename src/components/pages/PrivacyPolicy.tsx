import { Card, CardContent } from "@/components/ui/card";
import { Shield, Lock, Eye, FileText, UserCheck, Globe, Mail } from "lucide-react";
import { Link } from "@/lib/router-compat";
import Navbar from "@/components/Navbar";

const PrivacyPolicy = () => {
  const lastUpdated = "December 8, 2025";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 border border-primary/20 mb-4">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Privacy & Data Protection</span>
          </div>
          <h1 className="text-4xl font-bold mb-4">Privacy Policy</h1>
          <p className="text-muted-foreground">Last updated: {lastUpdated}</p>
        </div>

        {/* Introduction */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <p className="text-muted-foreground leading-relaxed">
              WeFindGuards ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains 
              how we collect, use, disclose, and safeguard your information when you use our platform. Please read this 
              policy carefully. By using WeFindGuards, you consent to the practices described in this Privacy Policy.
            </p>
          </CardContent>
        </Card>

        {/* Table of Contents */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">Table of Contents</h2>
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li><a href="#information-collected" className="hover:text-primary">Information We Collect</a></li>
              <li><a href="#how-we-use" className="hover:text-primary">How We Use Your Information</a></li>
              <li><a href="#data-sharing" className="hover:text-primary">Information Sharing and Disclosure</a></li>
              <li><a href="#data-security" className="hover:text-primary">Data Security</a></li>
              <li><a href="#data-retention" className="hover:text-primary">Data Retention</a></li>
              <li><a href="#your-rights" className="hover:text-primary">Your Rights</a></li>
              <li><a href="#gdpr" className="hover:text-primary">GDPR Rights (European Users)</a></li>
              <li><a href="#ccpa" className="hover:text-primary">CCPA Rights (California Residents)</a></li>
              <li><a href="#cookies" className="hover:text-primary">Cookies and Tracking</a></li>
              <li><a href="#children" className="hover:text-primary">Children's Privacy</a></li>
              <li><a href="#changes" className="hover:text-primary">Changes to This Policy</a></li>
              <li><a href="#contact" className="hover:text-primary">Contact Us</a></li>
            </ol>
          </CardContent>
        </Card>

        {/* Section 1: Information We Collect */}
        <section id="information-collected" className="mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <h2 className="text-2xl font-semibold">1. Information We Collect</h2>
              </div>
              
              <div className="space-y-6 text-muted-foreground">
                <div>
                  <h3 className="text-lg font-medium text-foreground mb-2">Personal Information You Provide</h3>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li><strong>Account Information:</strong> Name, email address, password, phone number</li>
                    <li><strong>Profile Information:</strong> Professional title, bio, work history, location, availability</li>
                    <li><strong>Sensitive Personal Information:</strong> Social Security Number (SSN), driver's license information (encrypted and stored securely)</li>
                    <li><strong>Certification Documents:</strong> Professional licenses, certifications, training records</li>
                    <li><strong>Company Information:</strong> Company name, business license, contact details</li>
                    <li><strong>Photos and Media:</strong> Profile photos, professional headshots</li>
                  </ul>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-foreground mb-2">Information Collected Automatically</h3>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    <li><strong>Usage Data:</strong> Pages visited, features used, time spent on platform</li>
                    <li><strong>Device Information:</strong> Browser type, operating system, IP address</li>
                    <li><strong>Log Data:</strong> Access times, error logs, referring URLs</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Section 2: How We Use Your Information */}
        <section id="how-we-use" className="mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Eye className="h-5 w-5 text-primary" />
                </div>
                <h2 className="text-2xl font-semibold">2. How We Use Your Information</h2>
              </div>
              
              <div className="text-muted-foreground space-y-4">
                <p>We use your information for the following purposes:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Platform Operations:</strong> To create and manage your account, facilitate connections between security professionals and companies</li>
                  <li><strong>Employment Matching:</strong> To match qualified security officers with appropriate job opportunities</li>
                  <li><strong>Verification:</strong> To verify professional credentials, certifications, and identity</li>
                  <li><strong>Communications:</strong> To send service updates, job notifications, and reminders about profile completion</li>
                  <li><strong>Security:</strong> To detect fraud, protect against unauthorized access, and maintain platform integrity</li>
                  <li><strong>Legal Compliance:</strong> To comply with applicable laws, regulations, and legal processes</li>
                  <li><strong>Platform Improvement:</strong> To analyze usage patterns and improve our services</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Section 3: Information Sharing */}
        <section id="data-sharing" className="mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <UserCheck className="h-5 w-5 text-primary" />
                </div>
                <h2 className="text-2xl font-semibold">3. Information Sharing and Disclosure</h2>
              </div>
              
              <div className="text-muted-foreground space-y-4">
                <p>We share your information only in the following circumstances:</p>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium text-foreground mb-2">With Security Companies (For Officers)</h3>
                    <p>When you apply for a position or a company expresses interest in hiring you, we share relevant profile information. Contact information (phone, email, address) is only shared after a hiring relationship is established or you apply to their job posting.</p>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium text-foreground mb-2">With Security Officers (For Companies)</h3>
                    <p>Companies can view officer profiles to find qualified candidates. Detailed contact information is restricted based on subscription tier and relationship status.</p>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium text-foreground mb-2">Service Providers</h3>
                    <p>We work with trusted third-party service providers who assist us in operating our platform, including:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                      <li>Cloud hosting and data storage (Supabase/Lovable Cloud)</li>
                      <li>Email communication services (Resend)</li>
                      <li>Payment processing (when applicable)</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium text-foreground mb-2">Legal Requirements</h3>
                    <p>We may disclose information when required by law, court order, or government request, or to protect our rights, safety, or property.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Section 4: Data Security */}
        <section id="data-security" className="mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Lock className="h-5 w-5 text-primary" />
                </div>
                <h2 className="text-2xl font-semibold">4. Data Security</h2>
              </div>
              
              <div className="text-muted-foreground space-y-4">
                <p>We implement industry-standard security measures to protect your personal information:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Encryption:</strong> Sensitive data (SSN, driver's license) is encrypted using AES-256-GCM encryption</li>
                  <li><strong>Access Controls:</strong> Row-Level Security (RLS) policies ensure users can only access authorized data</li>
                  <li><strong>Authentication:</strong> Secure JWT-based authentication with password strength requirements</li>
                  <li><strong>Audit Logging:</strong> All access to sensitive data is logged for security monitoring</li>
                  <li><strong>Secure Storage:</strong> Private storage buckets for sensitive documents with restricted access</li>
                  <li><strong>Data Masking:</strong> Sensitive information is masked in the user interface (e.g., SSN shown as ***-**-1234)</li>
                </ul>
                <p className="mt-4">While we strive to protect your information, no method of transmission over the Internet or electronic storage is 100% secure. We cannot guarantee absolute security.</p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Section 5: Data Retention */}
        <section id="data-retention" className="mb-8">
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-2xl font-semibold mb-4">5. Data Retention</h2>
              <div className="text-muted-foreground space-y-4">
                <p>We retain your personal information for as long as your account is active or as needed to provide services. Specifically:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Account Data:</strong> Retained while your account is active and for up to 3 years after deletion for legal compliance</li>
                  <li><strong>Employment Records:</strong> Retained for 7 years to support employment verification and legal requirements</li>
                  <li><strong>Audit Logs:</strong> Retained for 5 years for security and compliance purposes</li>
                  <li><strong>Sensitive Documents:</strong> Deleted within 30 days of account closure upon request</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Section 6: Your Rights */}
        <section id="your-rights" className="mb-8">
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-2xl font-semibold mb-4">6. Your Rights</h2>
              <div className="text-muted-foreground space-y-4">
                <p>You have the following rights regarding your personal information:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li><strong>Access:</strong> Request a copy of the personal data we hold about you</li>
                  <li><strong>Correction:</strong> Update or correct inaccurate personal information</li>
                  <li><strong>Deletion:</strong> Request deletion of your personal data (subject to legal retention requirements)</li>
                  <li><strong>Portability:</strong> Request your data in a machine-readable format</li>
                  <li><strong>Opt-out:</strong> Unsubscribe from marketing communications at any time</li>
                  <li><strong>Withdraw Consent:</strong> Withdraw consent for data processing where applicable</li>
                </ul>
                <p className="mt-4">To exercise any of these rights, please contact us at privacy@wefindguards.com</p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Section 7: GDPR */}
        <section id="gdpr" className="mb-8">
          <Card className="border-2 border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h2 className="text-2xl font-semibold">7. GDPR Rights (European Users)</h2>
              </div>
              
              <div className="text-muted-foreground space-y-4">
                <p>If you are located in the European Economic Area (EEA), you have additional rights under the General Data Protection Regulation (GDPR):</p>
                
                <div className="space-y-3">
                  <div>
                    <h3 className="font-medium text-foreground">Legal Basis for Processing</h3>
                    <p>We process your data based on: (a) your consent, (b) contract performance, (c) legal obligations, or (d) legitimate business interests.</p>
                  </div>
                  
                  <div>
                    <h3 className="font-medium text-foreground">Your GDPR Rights Include:</h3>
                    <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                      <li>Right to access your personal data</li>
                      <li>Right to rectification of inaccurate data</li>
                      <li>Right to erasure ("right to be forgotten")</li>
                      <li>Right to restrict processing</li>
                      <li>Right to data portability</li>
                      <li>Right to object to processing</li>
                      <li>Right to withdraw consent at any time</li>
                      <li>Right to lodge a complaint with a supervisory authority</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-medium text-foreground">International Data Transfers</h3>
                    <p>Your data may be transferred to and processed in the United States. We ensure appropriate safeguards are in place, including Standard Contractual Clauses approved by the European Commission.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Section 8: CCPA */}
        <section id="ccpa" className="mb-8">
          <Card className="border-2 border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <h2 className="text-2xl font-semibold">8. CCPA Rights (California Residents)</h2>
              </div>
              
              <div className="text-muted-foreground space-y-4">
                <p>If you are a California resident, you have rights under the California Consumer Privacy Act (CCPA):</p>
                
                <div className="space-y-3">
                  <div>
                    <h3 className="font-medium text-foreground">Your CCPA Rights Include:</h3>
                    <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                      <li><strong>Right to Know:</strong> Request disclosure of the categories and specific pieces of personal information we collect</li>
                      <li><strong>Right to Delete:</strong> Request deletion of personal information we have collected</li>
                      <li><strong>Right to Opt-Out:</strong> Opt out of the "sale" of personal information (we do not sell personal information)</li>
                      <li><strong>Right to Non-Discrimination:</strong> We will not discriminate against you for exercising your CCPA rights</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-medium text-foreground">Categories of Information Collected</h3>
                    <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                      <li>Identifiers (name, email, phone number, SSN)</li>
                      <li>Professional information (certifications, work history)</li>
                      <li>Internet activity (usage data, browsing history on our platform)</li>
                      <li>Geolocation data (general location based on IP address)</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-medium text-foreground">Do Not Sell My Personal Information</h3>
                    <p>WeFindGuards does not sell your personal information to third parties. If this practice changes, we will update this policy and provide an opt-out mechanism.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Section 9: Cookies */}
        <section id="cookies" className="mb-8">
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-2xl font-semibold mb-4">9. Cookies and Tracking</h2>
              <div className="text-muted-foreground space-y-4">
                <p>We use cookies and similar technologies to:</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>Maintain your session and authentication state</li>
                  <li>Remember your preferences and settings</li>
                  <li>Analyze platform usage and performance</li>
                  <li>Improve user experience</li>
                </ul>
                <p className="mt-4">You can control cookies through your browser settings. Note that disabling cookies may affect platform functionality.</p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Section 10: Children */}
        <section id="children" className="mb-8">
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-2xl font-semibold mb-4">10. Children's Privacy</h2>
              <div className="text-muted-foreground">
                <p>WeFindGuards is not intended for individuals under 18 years of age. We do not knowingly collect personal information from children. If we discover that we have collected information from a child under 18, we will delete it immediately. If you believe a child has provided us with personal information, please contact us.</p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Section 11: Changes */}
        <section id="changes" className="mb-8">
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-2xl font-semibold mb-4">11. Changes to This Policy</h2>
              <div className="text-muted-foreground">
                <p>We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the "Last updated" date. For significant changes, we may also send you an email notification. We encourage you to review this policy periodically.</p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Section 12: Contact */}
        <section id="contact" className="mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <h2 className="text-2xl font-semibold">12. Contact Us</h2>
              </div>
              
              <div className="text-muted-foreground space-y-4">
                <p>If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us:</p>
                <div className="bg-muted/50 rounded-lg p-4">
                  <p><strong>WeFindGuards Privacy Team</strong></p>
                  <p>Email: privacy@wefindguards.com</p>
                  <p>Website: wefindguards.com</p>
                </div>
                <p>We will respond to your request within 30 days (or sooner as required by applicable law).</p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Back to Home */}
        <div className="text-center mt-12">
          <Link to="/" className="text-primary hover:underline">
            ← Back to Home
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4 mt-12">
        <div className="container mx-auto max-w-6xl text-center text-muted-foreground">
          <p>© 2025 WeFindGuards. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default PrivacyPolicy;
