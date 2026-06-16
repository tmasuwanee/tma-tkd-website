import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, MapPin, Phone, Mail, Clock, Facebook, Instagram } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import TrialClassPicker from "@/components/TrialClassPicker";
import type { ClassSlot } from "../../../shared/classSchedule";
import { SMS_CONSENT_TEXT } from "../../../shared/smsConsent";

/**
 * Dedicated Free Class / Schedule a Tour page.
 * Accepts optional ?program=bjj|kickboxing|taekwondo|afterschool|summer query param
 * to pre-select the program interest dropdown.
 */

const PROGRAM_MAP: Record<string, string> = {
  bjj: "bjj",
  kickboxing: "kickboxing",
  taekwondo: "taekwondo",
  little_tigers: "little_tigers",
  littletigers: "little_tigers",
  afterschool: "afterschool",
  summer: "summer",
};

export default function FreeClass() {
  const [, navigate] = useLocation();
  const submitLeadMutation = trpc.leads.submit.useMutation();
  const [submitted, setSubmitted] = useState(false);

  // Read ?program= query param to pre-select program interest
  const searchParams = new URLSearchParams(window.location.search);
  const programParam = searchParams.get("program") ?? "";
  const preselectedProgram = PROGRAM_MAP[programParam.toLowerCase()] ?? "";

  // Capture UTM params from Facebook Ads / other campaigns
  const utmParams = {
    utmSource:   searchParams.get("utm_source")   ?? undefined,
    utmMedium:   searchParams.get("utm_medium")   ?? undefined,
    utmCampaign: searchParams.get("utm_campaign") ?? undefined,
    utmContent:  searchParams.get("utm_content")  ?? undefined,
  };

  const [formData, setFormData] = useState({
    parentName: "",
    kidName: "",
    kidAge: "",
    programInterest: preselectedProgram,
    motivation: "",
    email: "",
    phone: "",
    additionalNotes: "",
  });

  const [trialSlot, setTrialSlot] = useState<ClassSlot | null>(null);
  const [trialDate, setTrialDate] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 2026-06-08: CTIA-compliant SMS consent (Twilio toll-free verification).
  // Required to true before submit. Captured into lead row server-side for audit.
  const [smsConsent, setSmsConsent] = useState(false);

  // Update programInterest if query param changes (e.g. back/forward navigation)
  useEffect(() => {
    if (preselectedProgram) {
      setFormData(prev => ({ ...prev, programInterest: preselectedProgram }));
    }
  }, [preselectedProgram]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.parentName || !formData.kidName || !formData.kidAge || !formData.programInterest || !formData.email || !formData.phone) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (!smsConsent) {
      toast.error("Please check the SMS consent box to continue");
      return;
    }

    setIsSubmitting(true);
    try {
      await submitLeadMutation.mutateAsync({
        parentName: formData.parentName,
        kidName: formData.kidName,
        kidAge: formData.kidAge,
        programInterest: formData.programInterest,
        motivation: formData.motivation || undefined,
        email: formData.email,
        phone: formData.phone,
        additionalNotes: formData.additionalNotes || undefined,
        trialClassDate: trialDate || undefined,
        trialClassTime: trialSlot?.startTime || undefined,
        trialClassDay: trialSlot?.day || undefined,
        ...utmParams,
        smsConsent: true,
        smsConsentText: SMS_CONSENT_TEXT,
      });

      setSubmitted(true);
    } catch (error) {
      console.error("Form submission error:", error);
      toast.error("Failed to submit form. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white border-b border-border shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">TMA</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold text-primary">Top Martial Arts</h1>
              <p className="text-xs text-muted-foreground">Suwanee</p>
            </div>
          </a>

          <div className="hidden md:flex items-center gap-8">
            <a href="/#about" className="text-sm font-medium hover:text-accent transition">About</a>
            <a href="/#programs" className="text-sm font-medium hover:text-accent transition">Programs</a>
            <a href="/#leadership" className="text-sm font-medium hover:text-accent transition">Leadership</a>
            <a href="/#testimonials" className="text-sm font-medium hover:text-accent transition">Testimonials</a>
            <a href="/#contact" className="text-sm font-medium hover:text-accent transition">Contact</a>
          </div>

          <Button
            onClick={() => navigate("/")}
            variant="outline"
            className="border-primary text-primary hover:bg-primary hover:text-white"
          >
            Back to Home
          </Button>
        </div>
      </nav>

      {/* Hero Banner */}
      <section className="bg-primary py-16">
        <div className="container mx-auto px-4 text-center">
          <div className="inline-block mb-4 px-4 py-2 bg-accent/20 rounded-full">
            <span className="text-accent font-semibold text-sm tracking-wider">NO COMMITMENT REQUIRED</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Try a Free Class
          </h1>
          <p className="text-xl text-white/80 max-w-2xl mx-auto">
            Experience Top Martial Arts firsthand. Fill out the form below and we'll reach out to schedule your complimentary class.
          </p>
        </div>
      </section>

      {/* Form Section */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            {submitted ? (
              <Card className="bg-white border-2 border-accent shadow-xl">
                <div className="p-12 text-center">
                  <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 className="w-10 h-10 text-green-600" />
                  </div>
                  <h2 className="text-3xl font-bold text-primary mb-3">You're All Set!</h2>
                  <p className="text-gray-600 mb-2">
                    Thank you for your interest in Top Martial Arts Suwanee!
                  </p>
                  <p className="text-gray-500 text-sm mb-8">
                    Someone will reach out to you before your class to confirm the details.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                      onClick={() => navigate("/")}
                      className="bg-primary text-white hover:bg-primary/90"
                    >
                      Back to Home
                    </Button>
                    <Button
                      onClick={() => {
                        setSubmitted(false);
                        setFormData({ parentName: "", kidName: "", kidAge: "", programInterest: preselectedProgram, motivation: "", email: "", phone: "", additionalNotes: "" });
                        setTrialSlot(null);
                        setTrialDate("");
                      }}
                      variant="outline"
                      className="border-primary text-primary"
                    >
                      Submit Another
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="bg-white border-2 border-accent shadow-xl">
                <div className="p-8">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="parentName" className="text-primary font-semibold mb-2 block">
                          Parent Name *
                        </Label>
                        <Input
                          id="parentName"
                          name="parentName"
                          value={formData.parentName}
                          onChange={handleInputChange}
                          placeholder="Your name"
                          className="border-border focus:border-accent focus:ring-accent"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="kidName" className="text-primary font-semibold mb-2 block">
                          Child's Name *
                        </Label>
                        <Input
                          id="kidName"
                          name="kidName"
                          value={formData.kidName}
                          onChange={handleInputChange}
                          placeholder="Child's name"
                          className="border-border focus:border-accent focus:ring-accent"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="kidAge" className="text-primary font-semibold mb-2 block">
                          Age *
                        </Label>
                        <Input
                          id="kidAge"
                          name="kidAge"
                          type="number"
                          min="4"
                          max="99"
                          value={formData.kidAge}
                          onChange={handleInputChange}
                          placeholder="e.g. 8"
                          className="border-border focus:border-accent focus:ring-accent"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="programInterest" className="text-primary font-semibold mb-2 block">
                          Program Interest *
                        </Label>
                        <Select value={formData.programInterest} onValueChange={(value) => handleSelectChange('programInterest', value)}>
                          <SelectTrigger className="border-border focus:border-accent focus:ring-accent">
                            <SelectValue placeholder="Select program" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="little_tigers">Little Tigers Taekwondo (ages 4-5)</SelectItem>
                            <SelectItem value="taekwondo">Taekwondo (ages 6+)</SelectItem>
                            <SelectItem value="bjj">Brazilian Jiu-Jitsu</SelectItem>
                            <SelectItem value="kickboxing">Kickboxing</SelectItem>
                            <SelectItem value="afterschool">Afterschool Program</SelectItem>
                            <SelectItem value="summer">Summer Camp</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="motivation" className="text-primary font-semibold mb-2 block">
                        What are you looking for? (Optional)
                      </Label>
                      <Select value={formData.motivation} onValueChange={(value) => handleSelectChange('motivation', value)}>
                        <SelectTrigger className="border-border focus:border-accent focus:ring-accent">
                          <SelectValue placeholder="Select motivation" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="self-defense">Self-Defense</SelectItem>
                          <SelectItem value="discipline">Discipline & Focus</SelectItem>
                          <SelectItem value="fitness">Fitness & Health</SelectItem>
                          <SelectItem value="confidence">Confidence & Respect</SelectItem>
                          <SelectItem value="competition">Competition Training</SelectItem>
                          <SelectItem value="fun">Fun & Socializing</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Trial class calendar, shown when program + age are filled */}
                    {formData.programInterest && formData.kidAge && parseInt(formData.kidAge) >= 4 && (
                      <div>
                        <Label className="text-primary font-semibold mb-2 block">
                          Schedule Your Trial Class
                        </Label>
                        <TrialClassPicker
                          program={formData.programInterest}
                          age={parseInt(formData.kidAge)}
                          onSelect={(slot, date) => {
                            setTrialSlot(slot);
                            setTrialDate(date);
                          }}
                          selectedSlot={trialSlot ?? undefined}
                          selectedDate={trialDate}
                        />
                      </div>
                    )}

                    <div className="grid md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="email" className="text-primary font-semibold mb-2 block">
                          Email Address *
                        </Label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          value={formData.email}
                          onChange={handleInputChange}
                          placeholder="your@email.com"
                          className="border-border focus:border-accent focus:ring-accent"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="phone" className="text-primary font-semibold mb-2 block">
                          Phone Number *
                        </Label>
                        <Input
                          id="phone"
                          name="phone"
                          type="tel"
                          value={formData.phone}
                          onChange={handleInputChange}
                          placeholder="(770) 277-3009"
                          className="border-border focus:border-accent focus:ring-accent"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="additionalNotes" className="text-primary font-semibold mb-2 block">
                        Additional Questions (Optional)
                      </Label>
                      <Textarea
                        id="additionalNotes"
                        name="additionalNotes"
                        value={formData.additionalNotes}
                        onChange={handleInputChange}
                        placeholder="Tell us anything else we should know..."
                        className="border-border focus:border-accent focus:ring-accent"
                        rows={4}
                      />
                    </div>

                    {/* 2026-06-08: Twilio CTIA-compliant SMS consent. Required before submit. */}
                    <div className="flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <Checkbox
                        id="smsConsent"
                        checked={smsConsent}
                        onCheckedChange={v => setSmsConsent(v === true)}
                        className="mt-0.5"
                      />
                      <Label htmlFor="smsConsent" className="text-xs text-gray-700 leading-relaxed cursor-pointer font-normal">
                        I agree to receive recurring SMS text messages from Top Martial Arts
                        Suwanee (TMA) at the phone number above, including inquiry replies,
                        trial confirmations, class reminders, and program updates.
                        Frequency: up to 10 messages per month. Message and data rates may
                        apply. Reply <strong>STOP</strong> to unsubscribe or <strong>HELP</strong> for
                        help. Consent is not a condition of purchase. See{" "}
                        <a href="/sms-terms" target="_blank" className="underline text-primary">SMS Terms</a>{" "}
                        and{" "}
                        <a href="/privacy-policy" target="_blank" className="underline text-primary">Privacy Policy</a>.
                      </Label>
                    </div>

                    <Button
                      type="submit"
                      disabled={isSubmitting || !smsConsent}
                      size="lg"
                      className="w-full bg-accent text-accent-foreground hover:bg-accent/90 text-lg font-semibold"
                    >
                      {isSubmitting ? "Submitting..." : "Schedule My Free Class"}
                    </Button>

                    <p className="text-sm text-muted-foreground text-center">
                      Someone will reach out to you before your class to confirm the details.
                    </p>
                  </form>
                </div>
              </Card>
            )}
          </div>
        </div>
      </section>

      {/* Contact Info Strip */}
      <section className="py-12 bg-primary">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-6 text-center">
            <div className="flex flex-col items-center gap-2">
              <MapPin className="w-6 h-6 text-accent" />
              <p className="text-white text-sm font-medium">2005 Lawrenceville Suwanee Rd<br />Suwanee, GA 30024</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Phone className="w-6 h-6 text-accent" />
              <a href="tel:+17702773009" className="text-white text-sm font-medium hover:text-accent transition">(770) 277-3009</a>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Mail className="w-6 h-6 text-accent" />
              <a href="mailto:tmasuwanee@gmail.com" className="text-white text-sm font-medium hover:text-accent transition">tmasuwanee@gmail.com</a>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Clock className="w-6 h-6 text-accent" />
              <p className="text-white text-sm font-medium">Mon-Fri: 4PM-8PM<br />Sat: 9AM-12PM</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary/90 py-6 border-t border-white/10">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-white/60 text-sm">© 2026 Top Martial Arts Suwanee. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a href="https://www.facebook.com/TopMartialArtsSuwanee" target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-accent transition">
              <Facebook className="w-5 h-5" />
            </a>
            <a href="https://www.instagram.com/topmartialartssuwanee" target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-accent transition">
              <Instagram className="w-5 h-5" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
