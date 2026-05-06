import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronRight, Clock, Users, Award, Zap } from "lucide-react";
import { useLocation } from "wouter";

/**
 * Kickboxing Program Page
 * Design: Navy primary with Crimson Red accents
 */

export default function Kickboxing() {
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
            onClick={() => navigate('/free-class?program=kickboxing')}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Try Free Class
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative h-[500px] overflow-hidden bg-primary">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url('https://private-us-east-1.manuscdn.com/user_upload_by_module/session_file/310519663276898689/KQnyCuSsUrwQxXZM.jpg?Expires=1804101685&Signature=UWr52ZNg~XUDyX5VDgePDbsW-bigrm2MMcQWm4wMXjsAfkHP5z9XkCgFb4Z-fyJIFNF9-2MjbYhRsjhmsNivpkCJyQmB7mfrJjl9uuOuba1W0fLbX794U57OVqCn5zuOzcRpmE0Fw4vNvfIDm~wOBzU2DeX574VGUUW9-ZGeg6l05nYaWEDSflUXVx8asTsWnMlnc7~8Xp0qJbPGqo-cpUOSe695gLs8iGKA1EZq3ReBZG9K0zu~OerPA2PWLxikq50XisEep5c8LGuB~dDSPs-ADZgUA8VvlDM5hQnoRaO9s8DF3I7J1Ief9lW-8EPJs-GMaDWarChwJbp03VgSQ__&Key-Pair-Id=K2HSFNDJXOU9YS')",
          }}
        >
          <div className="absolute inset-0 bg-black/40"></div>
        </div>

        <div className="relative h-full container mx-auto px-4 flex items-center">
          <div className="max-w-2xl">
            <div className="inline-block mb-4 px-4 py-2 bg-accent/20 rounded-full">
              <span className="text-accent font-semibold text-sm">KICKBOXING PROGRAM</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
              Top Martial Arts Kickboxing
            </h1>
            <p className="text-xl text-white/90 mb-8 max-w-xl">
              TMA's kickboxing program combines the dynamic kicks and footwork from taekwondo fundamentals with boxing and muay thai principles for a wholistic striking system. High-energy classes designed to improve fitness, confidence, and striking technique. Perfect for teens and adults looking for an intense workout while learning proper striking skills.
            </p>
            <Button 
              size="lg"
              className="bg-accent text-accent-foreground hover:bg-accent/90 text-lg"
              onClick={() => navigate('/free-class?program=kickboxing')}
            >
              Try a Free Class <ChevronRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Program Overview */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl font-bold text-primary mb-6">What is Kickboxing?</h2>
              <p className="text-lg text-foreground/80 mb-4">
                Kickboxing is a striking martial art that blends taekwondo fundamentals with boxing and muay thai principles to create a wholistic striking system. At TMA, we teach authentic combat techniques that develop explosive power, precision timing, and dynamic striking combinations.
              </p>
              <p className="text-lg text-foreground/80 mb-8">
                Our kickboxing classes deliver an intense workout while teaching proper striking skills. You'll learn partner offensive and defensive drills, sparring techniques, and real combat applications—all taught safely with proper instruction. Whether you're training for self-defense, fitness, or athletic development, kickboxing builds strength, confidence, and practical striking ability.
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <Zap className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-primary mb-1">Punching, Kicking & Knee Strikes</h3>
                    <p className="text-foreground/70">Master proper technique for all striking methods in a controlled environment</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Award className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-primary mb-1">Real Technique</h3>
                    <p className="text-foreground/70">Learn authentic striking techniques used by professional fighters</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Users className="w-6 h-6 text-accent flex-shrink-0 mt-1" />
                  <div>
                    <h3 className="font-semibold text-primary mb-1">All Fitness Levels</h3>
                    <p className="text-foreground/70">Modify intensity to match your current fitness level and goals</p>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <video 
                src="https://private-us-east-1.manuscdn.com/user_upload_by_module/session_file/310519663276898689/FlyIdGKscuyatxqq.mov?Expires=1804101194&Signature=tHWUiHYLpZkFx2JYlqTMs9h3poJg4Sty1UYkzXwjBATkOVtSWFjQxa3sI5ShZV6CEuyHS4ClN8PuYCTbUJV3ABr2AlfAtk~JjCBw9Ce9~gCp~IINbmGK7LUGcHkOv6F1zVw8ggy7l9naFufhmX6h52z4JSoxAPcLtCtoYPrr7i0huZdToSm7EcbCcgkPUr4~afcLX8tvHnVvIs9kjZlX2aOs2qnA8GynquhCg9HUIgJvzocHCQdJq8lwIEQknlpQGzVdMCBuEY38LxHlV~Tsi~y33sRTkLABvTIFdDVA~PFU9vAkrdkUwYlaUcNmF5MyVxbGYaYWvuUyUG3cZ6XrrA__&Key-Pair-Id=K2HSFNDJXOU9YS"
                controls
                muted
                className="rounded-lg shadow-lg w-full h-auto"
              />
            </div>
          </div>
        </div>
      </section>



      {/* Free Class Form */}
      <section id="free-class-form" className="py-20 bg-primary">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-white mb-4">Ready to Get Started?</h2>
            <p className="text-xl text-white/80 mb-8">
              Try a free kickboxing class with no commitment. Get an intense workout and learn real striking techniques in a supportive environment.
            </p>
            <Button 
              size="lg"
              className="bg-accent text-accent-foreground hover:bg-accent/90 text-lg"
              onClick={() => navigate('/free-class?program=kickboxing')}
            >
              Schedule Your Free Class
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
