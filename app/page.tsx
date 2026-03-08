import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles, Video, Wand2 } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border/40 backdrop-blur-sm fixed top-0 w-full z-50 bg-background/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold">SciVid AI</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login">
                <Button variant="ghost" size="sm">Sign In</Button>
              </Link>
              <Link href="/register">
                <Button size="sm">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="pt-16">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
          <div className="absolute inset-0">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
          </div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 lg:py-40">
            <div className="text-center max-w-4xl mx-auto space-y-8">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-sm text-primary">
                <Sparkles className="h-4 w-4" />
                AI-Powered Science Video Generation
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-7xl font-bold tracking-tight">
                Turn Any Topic Into a{' '}
                <span className="bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                  Science Animation
                </span>
              </h1>

              <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
                Upload a reference video, enter a new topic, and our 13-step AI pipeline will generate
                a complete science animation with voiceover, visuals, and subtitles.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="/register">
                  <Button size="lg" className="text-base px-8">
                    Start Creating <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/login">
                  <Button variant="outline" size="lg" className="text-base px-8">
                    Sign In
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 border-t border-border/40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold mb-4">How It Works</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Three simple steps to generate professional science education videos
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center space-y-4 p-6 rounded-xl glass">
                <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
                  <Video className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">1. Upload Reference</h3>
                <p className="text-muted-foreground text-sm">
                  Upload a science animation video or paste a URL.
                  Our AI extracts the style DNA — visuals, narrative structure, tone, and pacing.
                </p>
              </div>

              <div className="text-center space-y-4 p-6 rounded-xl glass">
                <div className="w-16 h-16 mx-auto rounded-full bg-purple-500/20 flex items-center justify-center">
                  <Wand2 className="h-8 w-8 text-purple-400" />
                </div>
                <h3 className="text-xl font-semibold">2. Enter New Topic</h3>
                <p className="text-muted-foreground text-sm">
                  Provide your desired topic (e.g., &ldquo;how kidneys work&rdquo;).
                  AI researches, scripts, and storyboards the entire video automatically.
                </p>
              </div>

              <div className="text-center space-y-4 p-6 rounded-xl glass">
                <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
                  <Sparkles className="h-8 w-8 text-green-400" />
                </div>
                <h3 className="text-xl font-semibold">3. Get Your Video</h3>
                <p className="text-muted-foreground text-sm">
                  Watch as our pipeline generates keyframes, animates scenes, adds voiceover,
                  and assembles the final video with subtitles — ready to download.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 border-t border-border/40 bg-gradient-to-b from-primary/5 to-transparent">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
            <h2 className="text-3xl font-bold">Ready to Create?</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Join creators and educators using AI to produce engaging science content.
            </p>
            <Link href="/register">
              <Button size="lg" className="text-base px-8">
                Get Started Free <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/40 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>SciVid AI</span>
            </div>
            <p>&copy; {new Date().getFullYear()} SciVid AI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
