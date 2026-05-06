import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronRight, Clock, BookOpen, Users, Award } from "lucide-react";
import { useLocation } from "wouter";

/**
 * Afterschool Program Page
 * Design: Navy primary with Crimson Red accents
 */

export default function Afterschool() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white border-b border-border shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 hover:opacity-80 transition">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">TMA</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold text-primary">Top Martial Arts</h1>
              <p className="text-xs text-muted-foreground">Suwanee</p>
            </div>
          </button>
          
          <div className="hidden md:flex items-center gap-8">
            <button onClick={() => navigate("/")} className="text-sm font-medium hover:text-accent transition">Home</button>
            <a href="/#programs" className="text-sm font-medium hover:text-accent transition">Programs</a>
            <a href="/#contact" className="text-sm font-medium hover:text-accent transition">Contact</a>
          </div>

          <Button 
            onClick={() => navigate('/free-class?program=afterschool')}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Schedule a Tour
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative h-[500px] overflow-hidden bg-primary">
        <div className="absolute inset-0 bg-primary"></div>

        <div className="relative h-full container mx-auto px-4 flex items-center">
          <div className="max-w-2xl">
            <div className="inline-block mb-4 px-4 py-2 bg-accent/20 rounded-full">
              <span className="text-accent font-semibold text-sm">AFTERSCHOOL PROGRAM</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
              Afterschool Program
            </h1>
            <p className="text-xl text-white/90 mb-8 max-w-xl">
              We pick up your kids after school and bring them to TMA for martial arts training, homework completion, and supervised care.
            </p>
            <Button 
              size="lg"
              className="bg-accent text-accent-foreground hover:bg-accent/90 text-lg"
              onClick={() => navigate('/free-class?program=afterschool')}
            >
              Schedule a Tour <ChevronRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Program Overview */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-bold text-primary mb-6">What is Our Afterschool Program?</h2>
              <p className="text-lg text-foreground/80 mb-4">
                Our Afterschool Program is designed to provide a safe, enriching environment for school-age children after school hours. We pick up your kids and bring them to TMA for martial arts training, homework completion, and supervised care.
              </p>
              <p className="text-lg text-foreground/80 mb-8">
                Children complete their homework with instructor supervision, participate in martial arts training, and engage in team-building activities. It's the perfect solution for working parents who want their children in a safe, productive environment while learning martial arts.
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <BookOpen className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-primary mb-1">Homework Support</h3>
                    <p className="text-foreground/70">Supervised homework time with instructor assistance</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Award className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-primary mb-1">Martial Arts Training</h3>
                    <p className="text-foreground/70">Daily instruction in Taekwondo and martial arts fundamentals</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Users className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-primary mb-1">Character Development</h3>
                    <p className="text-foreground/70">Focus on respect, discipline, and leadership skills</p>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <img 
                src="https://private-us-east-1.manuscdn.com/user_upload_by_module/session_file/310519663276898689/ANroMGYLoSYGifIh.PNG?Expires=1804092394&Signature=Pn3WDt2ZLgoS0duJZWlKd4ty0vPUhPVSZe5d-bZuPXFYIHgsZiXbXE-qlPRvIbQ9Gz31qErBC9vWLXds8BtNmN6O43zDdqo92B3fGPXuv~PDHcmDfHVECt7JGgEppEo6LQ5Me1qs1RVAfCvwH5WNCXbCAV4XBvgxtzrugl0zXaMd4UN5hleEUs6jfYnN4kD4ecP2THBQRE2mFq5SiJh5Mp-FFTNCwtTr4VD-kjmTBLUXl3qu08iG4PBUzfeJMaMuJaTIoQ0XxquagopwY5RlB1luPsSVX8tnCfgkvoc6BjWK-yCHNWfVdnH1SHh8-2OQa9nVaj1AAGCLvcCXR8YFiA__&Key-Pair-Id=K2HSFNDJXOU9YS"
                alt="Afterschool program"
                className="rounded-lg shadow-lg w-full h-auto"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Daily Schedule */}
      <section className="py-20 bg-primary">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Daily Schedule</h2>
            <p className="text-xl text-white/80">A balanced mix of academics and martial arts training</p>
          </div>

          <div className="max-w-3xl mx-auto">
            <Card className="bg-white border-0 shadow-lg">
              <div className="p-8">
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="text-accent font-bold text-lg min-w-fit">4:00 - 4:30 PM</div>
                    <div>
                      <h3 className="font-semibold text-primary mb-1">Martial Arts Training</h3>
                      <p className="text-foreground/80">Taekwondo instruction and technique development (Monday - Thursday)</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="text-accent font-bold text-lg min-w-fit">4:00 - 4:30 PM</div>
                    <div>
                      <h3 className="font-semibold text-primary mb-1">Play Time</h3>
                      <p className="text-foreground/80">Free play and recreational activities (Friday)</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="text-accent font-bold text-lg min-w-fit">4:30 - 6:30 PM</div>
                    <div>
                      <h3 className="font-semibold text-primary mb-1">Homework Finishing & Activities</h3>
                      <p className="text-foreground/80">Complete homework, games, activities, or free time based on student needs</p>
                    </div>
                  </div>

                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>


      {/* Enrollment Section */}
      <section className="py-20 bg-primary">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-white mb-4">Enroll Today</h2>
            <p className="text-xl text-white/80 mb-8">
              Give your child a safe place to learn, grow, and thrive after school. Contact us to learn more about enrollment and pricing.
            </p>
            <Button 
              size="lg"
              className="bg-accent text-accent-foreground hover:bg-accent/90 text-lg"
              onClick={() => navigate('/free-class?program=afterschool')}
            >
              Schedule a Tour
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary/95 text-white py-8 border-t border-accent/20">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-center md:text-left">
              <p className="text-white/80">
                © 2025 Top Martial Arts Suwanee. All rights reserved.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => navigate("/")} className="text-white/80 hover:text-accent transition text-sm">Home</button>
              <span className="text-white/40">•</span>
              <a href="/#contact" className="text-white/80 hover:text-accent transition text-sm">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
