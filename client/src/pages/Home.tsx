import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MapPin, Phone, Mail, Clock, Facebook, Instagram, ChevronRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import TrialClassPicker from "@/components/TrialClassPicker";
import type { ClassSlot } from "../../../shared/classSchedule";

/**
 * Design Philosophy: Dynamic Energy & Motion
 * - Navy (#1a2d5a) primary with Crimson Red (#c41e3a) accents
 * - Poppins (bold) for headings, Inter for body
 * - Asymmetric layouts with smooth animations
 * - Motion-first interactions with hover effects
 */

export default function Home() {
  // The userAuth hooks provides authentication state
  // To implement login/logout functionality, simply call logout() or redirect to getLoginUrl()
  let { user, loading, error, isAuthenticated, logout } = useAuth();

  const [, navigate] = useLocation();
  const submitLeadMutation = trpc.leads.submit.useMutation();

  // Capture UTM params once on mount
  const utmParams = (() => {
    const p = new URLSearchParams(window.location.search);
    return {
      utmSource:   p.get("utm_source")   ?? undefined,
      utmMedium:   p.get("utm_medium")   ?? undefined,
      utmCampaign: p.get("utm_campaign") ?? undefined,
      utmContent:  p.get("utm_content")  ?? undefined,
    };
  })();

  const [formData, setFormData] = useState({
    parentName: "",
    kidName: "",
    kidAge: "",
    programInterest: "",
    motivation: "",
    email: "",
    phone: "",
    additionalNotes: "",
  });

  const [trialSlot, setTrialSlot] = useState<ClassSlot | null>(null);
  const [trialDate, setTrialDate] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.parentName || !formData.kidName || !formData.kidAge || !formData.programInterest || !formData.email || !formData.phone) {
      toast.error("Please fill in all required fields");
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
      });
      toast.success("Thank you! We'll contact you soon to schedule your free class.");
      
      // Reset form
      setFormData({
        parentName: "",
        kidName: "",
        kidAge: "",
        programInterest: "",
        motivation: "",
        email: "",
        phone: "",
        additionalNotes: "",
      });
      setTrialSlot(null);
      setTrialDate("");
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
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">TMA</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold text-primary">Top Martial Arts</h1>
              <p className="text-xs text-muted-foreground">Suwanee</p>
            </div>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <a href="#about" className="text-sm font-medium hover:text-accent transition">About</a>
            <a href="#programs" className="text-sm font-medium hover:text-accent transition">Programs</a>
            <a href="#leadership" className="text-sm font-medium hover:text-accent transition">Leadership</a>
            <a href="#testimonials" className="text-sm font-medium hover:text-accent transition">Testimonials</a>
            <a href="#contact" className="text-sm font-medium hover:text-accent transition">Contact</a>
          </div>

          <Button 
            onClick={() => navigate('/free-class')}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Try Free Class
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative h-[600px] overflow-hidden bg-primary">
        {/* Background Video with Overlay */}
        <video 
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        >
          <source src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663276898689/uqzrgyXrYKdJLgpN.mov" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/40"></div>

        {/* Content */}
        <div className="relative h-full container mx-auto px-4 flex items-center">
          <div className="max-w-2xl">
            <div className="inline-block mb-4 px-4 py-2 bg-accent/20 rounded-full">
              <span className="text-accent font-semibold text-sm">MARTIAL ARTS EXCELLENCE</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
              Top Martial Arts in Suwanee, GA
            </h1>
            <p className="text-xl text-white/90 mb-8 max-w-xl">
              Whether you're looking for Taekwondo, Brazilian Jiu-Jitsu, Kickboxing, or our Afterschool Program and seasonal camps, Top Martial Arts Suwanee offers expert instruction for all ages and skill levels.
            </p>
            <Button 
              onClick={() => navigate('/free-class')}
              size="lg"
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              Try a Free Class <ChevronRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </section>


      {/* About Section */}
      <section id="about" className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-block mb-4 px-4 py-2 bg-accent/10 rounded-full">
                <span className="text-primary font-semibold text-sm">ABOUT US</span>
              </div>
             <h2 className="text-4xl font-bold text-primary mb-4">Why Choose Top Martial Arts Suwanee for Martial Arts Training?</h2>
            <p className="text-xl text-foreground/80 max-w-2xl mx-auto">
              We are a premier martial arts school in Suwanee and Lawrenceville, GA dedicated to developing strong, confident, and disciplined students of all ages. Whether you're interested in Taekwondo for traditional martial arts training, Brazilian Jiu-Jitsu for ground-based grappling, Kickboxing for dynamic striking, or our Afterschool Program for convenient supervised care and training, we offer expert instruction tailored to your goals and lifestyle.       </p>
              
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-white text-sm font-bold">✓</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-primary mb-1">Professional Instructors</h3>
                    <p className="text-foreground/80">Professional martial artists with years of expertise</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-white text-sm font-bold">✓</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-primary mb-1">Programs for All Ages</h3>
                    <p className="text-foreground/80">From children, teens, and adults with age-appropriate instruction</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-white text-sm font-bold">✓</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-primary mb-1">Safe & Supportive Environment</h3>
                    <p className="text-foreground/80">Family-friendly atmosphere with professional instruction</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative h-96 rounded-lg overflow-hidden shadow-xl">
              <video 
                className="w-full h-full object-cover"
                autoPlay
                muted
                loop
                playsInline
              >
                <source src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663276898689/uqzrgyXrYKdJLgpN.mov" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        </div>
      </section>

      {/* Programs Section */}
      <section id="programs" className="py-20 bg-primary">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <div className="inline-block mb-4 px-4 py-2 bg-accent/20 rounded-full">
              <span className="text-accent font-semibold text-sm">OUR PROGRAMS</span>
            </div>
            <h2 className="text-4xl font-bold text-white mb-4">Our Programs</h2>
            <p className="text-lg text-white/80 max-w-2xl mx-auto">
              Choose from our variety of programs designed for all ages and skill levels. Taekwondo, Brazilian Jiu-Jitsu, Kickboxing, Afterschool training, and seasonal camps—expert instruction in Suwanee and Lawrenceville
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "Taekwondo",
                description: "Traditional taekwondo for ages 4 and up. Build discipline, coordination, and confidence through kicks, forms, and sparring. Develop focus, respect, and athletic skills in a supportive environment.",
                image: "/tkd-card-screenshot-v2.jpg",
                link: "/taekwondo"
              },
              {
                title: "Brazilian Jiu-Jitsu",
                description: "Learn grappling and ground fighting with Master Jo. Develop real self-defense skills through controlled drills, technique work, and rolling. Safe, respectful training for all levels.",
                image: "https://private-us-east-1.manuscdn.com/user_upload_by_module/session_file/310519663276898689/lmWnKYYOVjyQNtSf.jpg?Expires=1804099066&Signature=az-3G0R6vcAGvuYGphE4r9rorgTDxbleb3nV4ThS5Lawb6PtnnRif5793jVmtwLWKLZyrcJGmcKB4-jfoNlbbOtgYap3QYmXQH86Aj0JMcH20pGl4lhCxswqLfrKxbUX76hFQI0NjPffHTwbTYEk~nwpgVmVMSxiknVPXwZFkGjrxKjPEKm5PHUzDiIq~-Y~z4YmxQ04PHdyMJL3ZPqyYoBMotTkuRbuYuFMVwavfTtaNJk~4ENo5WWEaPc7vFs6X9xkMNYwXVrH8TWPukRwlaXBlRHyxzQuUuOMiRK0R17NDgmxzsd3y0sjL9Gc3jR~7gmo~c1kiv81fP6wDTo~uA__&Key-Pair-Id=K2HSFNDJXOU9YS",
                link: "/bjj"
              },
              {
                title: "Kickboxing",
                description: "Learn striking with punching, kicking, and knee techniques through partner drills, combinations, and controlled sparring. High-energy training for kids 9 and up, teens, and adults.",
                image: "https://private-us-east-1.manuscdn.com/user_upload_by_module/session_file/310519663276898689/fLmmxFDaAHkWhhca.jpg?Expires=1804101194&Signature=m8erRLpUGqq~xsLNnWpFqZ5GWEsje3SEEOqKwmcQyOQLFW5Twk4TXVita1YgoIKs9oGcOkQr63TgyZcRqYhDhEwwLe2GfmlK~XEe4BLpx6ZsyUpHmExkUGivUwfbaCXRDWKEeqdWJKYrdznpBs1bC4b5WoxnS6Dn8L37PIT20v-h1HhQF8FWf3u6x29-kiN9jfdI7nv0HebVabwm8J38YL7B1yGSnA-EYVeZJElZFitCiBOHmytXzVCQlqGkt9N0oqx1BrRPgURQyrskz6XrTg2S8s6I9aejnipmEi0yBaXGDzFD029ZQ6jRElaGGg2CkJ5pJhRZDEjxgDRn~BlX4A__&Key-Pair-Id=K2HSFNDJXOU9YS",
                link: "/kickboxing"
              },
              {
                title: "Afterschool Program",
                description: "We pick up your kids after school and bring them to TMA for training and supervised care. They'll learn martial arts, build friendships, and have fun in a safe environment.",
                image: "https://private-us-east-1.manuscdn.com/user_upload_by_module/session_file/310519663276898689/ANroMGYLoSYGifIh.PNG?Expires=1804092394&Signature=Pn3WDt2ZLgoS0duJZWlKd4ty0vPUhPVSZe5d-bZuPXFYIHgsZiXbXE-qlPRvIbQ9Gz31qErBC9vWLXds8BtNmN6O43zDdqo92B3fGPXuv~PDHcmDfHVECt7JGgEppEo6LQ5Me1qs1RVAfCvwH5WNCXbCAV4XBvgxtzrugl0zXaMd4UN5hleEUs6jfYnN4kD4ecP2THBQRE2mFq5SiJh5Mp-FFTNCwtTr4VD-kjmTBLUXl3qu08iG4PBUzfeJMaMuJaTIoQ0XxquagopwY5RlB1luPsSVX8tnCfgkvoc6BjWK-yCHNWfVdnH1SHh8-2OQa9nVaj1AAGCLvcCXR8YFiA__&Key-Pair-Id=K2HSFNDJXOU9YS",
                link: "/afterschool"
              },
              {
                title: "Summer Camps",
                description: "Summer fun with martial arts training, field trips, activities, and new friends. Full days of action-packed learning and adventure in a supportive community.",
                image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663276898689/XZyF96feSckHUgem3ipsHV/summer-camps-hero-WdXpwTRnJvTrCZMFGrwwUM.webp",
                link: "/summer-camps"
              },
            ].map((program, idx) => (
              <Card key={idx} className="bg-white border-0 shadow-lg overflow-hidden hover:shadow-xl transition">
                <div className="h-48 overflow-hidden">
                  <img src={program.image} alt={`${program.title} classes in Suwanee GA`} className="w-full h-full object-cover" />
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-bold text-primary mb-3">{program.title}</h3>
                  <p className="text-foreground/80 mb-6">{program.description}</p>
                  <a href={program.link}>
                    <Button variant="outline" className="w-full border-accent text-accent hover:bg-accent/10">
                      Learn More
                    </Button>
                  </a>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>



      {/* Leadership Section */}
      <section id="leadership" className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <div className="inline-block mb-4 px-4 py-2 bg-accent/10 rounded-full">
              <span className="text-primary font-semibold text-sm">OUR TEAM</span>
            </div>
            <h2 className="text-4xl font-bold text-primary mb-4">Meet Our Leadership</h2>
            <p className="text-xl text-foreground/80 max-w-2xl mx-auto">
              Experienced instructors dedicated to your success
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                name: "Master Jo",
                title: "5th Dan Taekwondo Master & Brazilian Jiu-Jitsu Instructor",
                bio: ""
              },
              {
                name: "Master Arfa",
                title: "4th Dan Taekwondo Master & Kickboxing Coach",
                bio: ""
              }
            ].map((member, idx) => (
              <Card key={idx} className="bg-white border-0 shadow-lg text-center p-8">
                <div className="w-24 h-24 bg-accent/20 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <span className="text-4xl">👤</span>
                </div>
                <h3 className="text-xl font-bold text-primary mb-2">{member.name}</h3>
                <p className="text-accent font-semibold mb-2">{member.title}</p>
                <p className="text-foreground/80">{member.bio}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-20 bg-primary">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <div className="inline-block mb-4 px-4 py-2 bg-accent/20 rounded-full">
              <span className="text-accent font-semibold text-sm">TESTIMONIALS</span>
            </div>
            <h2 className="text-4xl font-bold text-white mb-4">What Parents Say</h2>
            <p className="text-xl text-white/80 max-w-2xl mx-auto">
              Hear from families who have experienced the TMA difference
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                name: "Max Klein",
                role: "Parent",
                text: "We are so very pleased to be a part of Top Martial Arts. Very professional and caring team."
              },
              {
                name: "Katherine Harrington",
                role: "Parent",
                text: "My girls have started in another state and their master referred us here. They made my kids feel welcome and part of the team. My girls are so happy here."
              },
              {
                name: "GS",
                role: "Parent",
                text: "My daughter started afterschool taekwondo classes here. She really loves this place. Teachers and admin people are really nice and friendly."
              },
              {
                name: "Alexius Taylor",
                role: "Parent",
                text: "My son absolutely loves it! The teachers are awesome and I can see a huge improvement in his discipline and focus."
              },
              {
                name: "Jennifer Lee",
                role: "Parent",
                text: "Outstanding instruction and a truly supportive community. Our family couldn't ask for a better place to train."
              },
              {
                name: "David Martinez",
                role: "Parent",
                text: "The instructors genuinely care about each student's progress. Highly recommend to any parent looking for quality martial arts training."
              }
            ].map((testimonial, idx) => (
              <Card key={idx} className="bg-white border-0 shadow-lg">
                <div className="p-8">
                  <div className="flex gap-1 mb-4">
                    {[...Array(5)].map((_, i) => (
                      <span key={i} className="text-accent text-lg">★</span>
                    ))}
                  </div>
                  <p className="text-foreground/80 mb-6 italic">"{testimonial.text}"</p>
                  <div>
                    <p className="font-semibold text-primary">{testimonial.name}</p>
                    <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Free Class Form Section */}
      <section id="free-class-form" className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-block mb-4 px-4 py-2 bg-accent/10 rounded-full">
                <span className="text-primary font-semibold text-sm">GET STARTED</span>
              </div>
              <h2 className="text-4xl font-bold text-primary mb-4">Try a Free Class</h2>
              <p className="text-xl text-foreground/80">
                No commitment required. Experience Top Martial Arts firsthand with a complimentary class.
              </p>
            </div>

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
                          <SelectItem value="taekwondo">Taekwondo</SelectItem>
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

                  {/* Trial class calendar */}
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
                        placeholder="(555) 123-4567"
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

                  <Button 
                    type="submit"
                    disabled={isSubmitting}
                    size="lg"
                    className="w-full bg-accent text-accent-foreground hover:bg-accent/90 text-lg font-semibold"
                  >
                    {isSubmitting ? "Submitting..." : "Schedule My Free Class"}
                  </Button>

                  <p className="text-sm text-muted-foreground text-center">
                    We'll contact you within 24 hours to confirm your free class time.
                  </p>
                </form>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-20 bg-primary">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12">
            <div>
              <div className="inline-block mb-4 px-4 py-2 bg-accent/20 rounded-full">
                <span className="text-accent font-semibold text-sm">CONTACT US</span>
              </div>
              <h2 className="text-4xl font-bold text-white mb-8">Get in Touch</h2>
              
              <div className="space-y-6">
                <div className="flex gap-4">
                  <MapPin className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-white mb-1">Location</h3>
                    <p className="text-white/80">2005 Lawrenceville Suwanee Rd</p>
                    <p className="text-white/80">Suwanee, GA 30024</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <Phone className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-white mb-1">Phone</h3>
                    <p className="text-white/80">(770) 277-3009</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <Mail className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-white mb-1">Email</h3>
                    <p className="text-white/80">tmasuwanee@gmail.com</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <Clock className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-white mb-1">Hours</h3>
                    <p className="text-white/80">Monday - Friday: 2:30 PM - 8:30 PM</p>
                    <p className="text-white/80">Saturday: 10:00 AM - 2:00 PM</p>
                    <p className="text-white/80">Sunday: Closed</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <a href="#" className="w-10 h-10 bg-accent/20 rounded-full flex items-center justify-center hover:bg-accent/30 transition">
                  <Facebook className="w-5 h-5 text-accent" />
                </a>
                <a href="#" className="w-10 h-10 bg-accent/20 rounded-full flex items-center justify-center hover:bg-accent/30 transition">
                  <Instagram className="w-5 h-5 text-accent" />
                </a>
              </div>
            </div>

            <div className="bg-white/10 rounded-lg p-8 backdrop-blur">
              <h3 className="text-2xl font-bold text-white mb-6">Quick Links</h3>
              <div className="space-y-3">
                <a href="#about" className="flex items-center gap-2 text-white hover:text-accent transition">
                  <ChevronRight className="w-4 h-4" /> About Us
                </a>
                <a href="#programs" className="flex items-center gap-2 text-white hover:text-accent transition">
                  <ChevronRight className="w-4 h-4" /> Programs
                </a>
                <a href="#leadership" className="flex items-center gap-2 text-white hover:text-accent transition">
                  <ChevronRight className="w-4 h-4" /> Our Team
                </a>
                <a href="#testimonials" className="flex items-center gap-2 text-white hover:text-accent transition">
                  <ChevronRight className="w-4 h-4" /> Testimonials
                </a>
                <a href="#free-class-form" className="flex items-center gap-2 text-white hover:text-accent transition">
                  <ChevronRight className="w-4 h-4" /> Try Free Class
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary/95 border-t border-accent/20 py-8">
        <div className="container mx-auto px-4 text-center text-white/80">
          <p>&copy; 2024 Top Martial Arts Suwanee. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
