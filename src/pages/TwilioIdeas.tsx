import React from "react";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Phone, MessageSquare, Video, ShieldCheck, Mic, Search, Workflow,
  Mail, MapPin, Bot, Sparkles, Building2, Heart, Wrench, Home as HomeIcon,
  Store, Scale, PawPrint, Church, Camera, Rocket, DollarSign, Layers,
} from "lucide-react";

/**
 * Twilio + Lovable + AI — Service Ideas Reference Page
 * A long-form, perusable layout of every angle we've spitballed so far.
 * Pure presentation. No backend wiring.
 */

type Capability = {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  blurb: string;
  resell: string[];
};

const CAPABILITIES: Capability[] = [
  {
    icon: MessageSquare,
    name: "Programmable SMS / MMS",
    blurb: "Send & receive text and picture messages on a real phone number. The bread-and-butter.",
    resell: [
      "Emergency dispatch blasts with on-call rotation",
      "Appointment reminders with Y/N/RESCHEDULE handling",
      "Daily senior / PSW wellness check-ins",
      "Order status, delivery pings, restock alerts",
      "Photo-in/photo-out for trades (garage door, leaky pipe)",
    ],
  },
  {
    icon: Phone,
    name: "Programmable Voice + TTS",
    blurb: "Place and receive phone calls. Read AI-generated text aloud. Build IVR menus.",
    resell: [
      "AI Receptionist — answers 24/7, books, routes, transcribes",
      "Voice fallback if SMS not acknowledged in 5 min (emergencies)",
      "After-hours triage line for clinics, plumbers, locksmiths",
      "Robo-confirmation calls for elderly clients who don't text",
      "Outbound campaign calls with TTS (event reminders, polls)",
    ],
  },
  {
    icon: Video,
    name: "Video (Programmable Video)",
    blurb: "Embed multi-party HD video rooms inside any web page. Recording + transcripts available.",
    resell: [
      "Telehealth-in-a-box for therapists & clinics",
      "Virtual notary / lawyer consults with session recording",
      "Remote inspections for insurance, contractors, real estate",
      "Tutor / coaching rooms with auto-transcription",
      "Wedding officiant + remote-guest streaming",
    ],
  },
  {
    icon: ShieldCheck,
    name: "Verify (OTP / 2FA)",
    blurb: "Passwordless login codes via SMS, voice, email, WhatsApp, or TOTP — all in one API.",
    resell: [
      "Drop-in passwordless login for any client portal",
      "Age-gate / consent confirm for regulated industries",
      "High-value action 2FA (large invoice, refund, address change)",
      "Reduce password reset support tickets to near zero",
    ],
  },
  {
    icon: Search,
    name: "Lookup",
    blurb: "Validate phone numbers, identify carrier, detect VOIP/landline/mobile, fraud score.",
    resell: [
      "Form-fill validation — block junk numbers at signup",
      "Lead-quality scoring before a salesperson dials",
      "Fraud screen on checkout / account creation",
      "Clean up old CRM contact lists for clients",
    ],
  },
  {
    icon: Workflow,
    name: "Conversations API",
    blurb: "Threaded two-way conversations across SMS, WhatsApp, MMS, chat — with full history.",
    resell: [
      "Unified inbox for small businesses (replaces 4 apps)",
      "Group chats between client + tech + dispatcher",
      "Persistent customer context for AI agent replies",
      "Hand-off from AI to human without losing thread",
    ],
  },
  {
    icon: Mic,
    name: "Voice Intelligence",
    blurb: "Real-time transcription, sentiment, PII redaction, custom operators on call audio.",
    resell: [
      "Auto-transcribed call notes pushed to CRM",
      "Compliance recording for finance / health clients",
      "Sentiment alerts ('angry customer on line 2')",
      "Searchable call archive for legal discovery",
    ],
  },
  {
    icon: Mail,
    name: "SendGrid (Email)",
    blurb: "Twilio-owned. Transactional + marketing email with templates, tracking, deliverability.",
    resell: [
      "Branded transactional email for every client site",
      "Drip campaigns triggered by SMS/Voice events",
      "Newsletter platform white-label for small biz",
      "Receipts, invoices, password-reset infra",
    ],
  },
  {
    icon: MapPin,
    name: "WhatsApp Business",
    blurb: "Same flows as SMS but free outside the US and globally dominant for messaging.",
    resell: [
      "International client communication (zero per-message cost)",
      "Rich media catalogs for retailers (browse products in chat)",
      "Appointment booking for clinics in WhatsApp-heavy markets",
      "Tour guides, hotels, travel agents — global reach",
    ],
  },
  {
    icon: Bot,
    name: "Studio (Flow Builder)",
    blurb: "Drag-and-drop visual builder for SMS/Voice flows. Or skip it and build our own engine.",
    resell: [
      "Let non-technical clients edit their own flows",
      "Rapid prototype demos for sales calls",
      "Power our white-label dashboard's workflow editor",
    ],
  },
];

type Vertical = {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  productNames: string[];
  pain: string;
  flow: string[];
  twilio: string[];
  ai: string;
  pricing: string;
};

const VERTICALS: Vertical[] = [
  {
    icon: Wrench,
    name: "Trades & Emergency Services",
    productNames: ["PipeAlert", "AfterHours", "DispatchOne"],
    pain: "Plumbers, HVAC, electricians lose jobs at 2am because no one answers. Manual on-call rotation is chaos.",
    flow: [
      "Customer hits big red EMERGENCY button on client's website",
      "1-tap form: name, address, problem (free text), photo",
      "SMS blasts current on-call tech with ETA-request",
      "No reply in 90s → rotate to next tech automatically",
      "AI classifies severity P1/P2/P3 from photo + text",
      "Drafts briefing SMS for tech: 'Burst pipe basement, water still flowing, owner shut off main'",
      "Voice fallback after 5min silence — robocalls tech with TTS summary",
      "Post-job: invoice link + Google review SMS",
    ],
    twilio: ["SMS", "MMS (photos)", "Voice + TTS fallback", "Lookup (block junk)", "Conversations"],
    ai: "Severity triage, photo analysis, briefing summarization, customer reply drafts in client's brand voice",
    pricing: "$99-199/mo + per-emergency surcharge",
  },
  {
    icon: Heart,
    name: "Senior Safety & Personal Support Workers",
    productNames: ["CheckOnMe", "DailyPing", "SafeAt Home"],
    pain: "Family worries when Mom doesn't answer. PSWs need lightweight check-in without an app.",
    flow: [
      "9am auto-SMS: 'Good morning Margaret, how are you today?'",
      "Reply parsed by AI — 'fine', 'tired', 'fell down' all handled differently",
      "Panic words ('HELP', 'FELL', 'CHEST PAIN') → instant escalation",
      "Escalation = SMS family + voice call to PSW + optional 911",
      "No reply in 30min → voice call with TTS check",
      "Still no reply → escalate up family tree",
      "Weekly digest SMS to family: 'Mom replied 6/7 days, mentioned knee pain Tuesday'",
      "Optional MMS — Mom sends photo of injury, AI describes it to family",
    ],
    twilio: ["SMS", "MMS", "Voice + TTS", "Conversations (family thread)", "WhatsApp for overseas family"],
    ai: "Mood interpretation, panic-word detection, weekly summary generation, fuzzy-reply parsing",
    pricing: "$29/mo (family pays, not senior) × thousands of families",
  },
  {
    icon: HomeIcon,
    name: "Real Estate",
    productNames: ["YardCode", "ListingLine", "TenantText"],
    pain: "Agents miss leads. Renters can't reach landlords. Open houses are a logistical mess.",
    flow: [
      "Sign-in-yard SMS: text PROP123 to get instant listing details + AI Q&A",
      "Open house auto-check-in via SMS (no clipboard)",
      "Tenant texts maintenance issue → AI triages + routes to right vendor",
      "Rent reminders 5 days out → 1 day out → overdue",
      "Showing booking by SMS with calendar slot picker",
    ],
    twilio: ["SMS short-codes", "MMS for listing photos", "Verify for tenant portals", "Lookup"],
    ai: "Listing Q&A bot, maintenance triage, lease question answering",
    pricing: "$49-149/mo per agent or property mgr",
  },
  {
    icon: Store,
    name: "Retail & Local Commerce",
    productNames: ["RestockMe", "CartRescue", "VIPText"],
    pain: "Small shops can't compete with Amazon notifications. Abandoned carts bleed money.",
    flow: [
      "Customer texts WAIT [item] to be notified on restock",
      "Abandoned cart → SMS in 1hr with discount + 1-tap checkout",
      "VIP early access drops via SMS list",
      "Order status, pickup ready pings",
      "Birthday club with coupon",
    ],
    twilio: ["SMS", "MMS for product previews", "WhatsApp for catalog", "SendGrid for receipts"],
    ai: "Personalized product recs, reply parsing ('do you have it in blue?'), inventory Q&A",
    pricing: "$49-99/mo + $0.02 per delivered SMS",
  },
  {
    icon: Scale,
    name: "Professional Services (Legal / Accounting / Consulting)",
    productNames: ["DocChase", "CourtPing", "IntakeBot"],
    pain: "Document collection drags out cases. Court date no-shows = real consequences.",
    flow: [
      "AI intake bot — collects client story via SMS conversation",
      "Document chase — automated SMS until W2/contract/ID received",
      "Court date reminders: 1 week, 1 day, morning of",
      "Hearing prep checklist drip",
      "Secure doc upload via SMS-delivered short-lived link",
    ],
    twilio: ["SMS", "Verify for secure doc links", "Voice for elderly clients", "Conversations"],
    ai: "Intake conversation, doc classification, reminder timing optimization",
    pricing: "$79-249/mo per practitioner",
  },
  {
    icon: PawPrint,
    name: "Pet Services",
    productNames: ["PetPing", "WalkieTalkie", "LostPet"],
    pain: "Pet owners are anxious. Walkers need lightweight comms. Lost-pet networks are Facebook chaos.",
    flow: [
      "Walk start SMS with map link",
      "Mid-walk photo MMS: 'Bailey having a great time!'",
      "Walk end SMS: 'Home safe, water topped up'",
      "Lost pet → SMS blasts opted-in neighbors within geofence",
      "Boarding check-ins with daily photo",
    ],
    twilio: ["SMS", "MMS", "Geo-aware number pools", "Lookup"],
    ai: "Auto-caption photos, draft personality-matched updates per pet",
    pricing: "$29-79/mo per business",
  },
  {
    icon: Church,
    name: "Community, Faith & Volunteer Groups",
    productNames: ["PrayChain", "VolunteerNow", "FlockText"],
    pain: "Phone trees are dead. Email gets ignored. Facebook reach is gone.",
    flow: [
      "Prayer chain — one tap broadcasts to opted-in members",
      "Volunteer dispatch — 'need 4 people Saturday 9am, reply YES'",
      "Service cancellations / weather closures",
      "Donation receipts + tax letters via SendGrid",
      "Pastoral check-ins for shut-ins",
    ],
    twilio: ["SMS", "Voice for elderly", "SendGrid", "WhatsApp for international missions"],
    ai: "Compose pastoral messages in voice of clergy, summarize volunteer signups",
    pricing: "$19-79/mo per org (charity-friendly tier)",
  },
  {
    icon: Camera,
    name: "Creative & Events",
    productNames: ["VendorSync", "GuestHelp", "BookClubText"],
    pain: "Wedding coordination is a spreadsheet hell. Event guests have 100 questions.",
    flow: [
      "Wedding vendor coordination thread per event",
      "Guest helpdesk number — 'where is parking?' AI answers from event FAQ",
      "Day-of timeline SMS to vendors as cues fire",
      "Photo MMS request to guests post-event ('send us your pics!')",
      "SMS book club — discussion prompts, RSVP, location",
    ],
    twilio: ["SMS", "MMS", "Conversations", "Verify"],
    ai: "FAQ answering, photo curation, vendor timeline updates",
    pricing: "Per-event $99-499 or $49/mo retainer",
  },
];

const PLATFORM_LAYERS = [
  {
    title: "Multi-tenant backbone",
    icon: Building2,
    points: [
      "tenants table: client info, Twilio subaccount or shared number, plan tier",
      "workflows table: JSON-defined flows (trigger → steps → escalation)",
      "messages table: every inbound/outbound across all channels",
      "AI router: classify intent → route to right workflow → log",
      "Webhook receiver: one URL per tenant, handles inbound SMS/Voice/WA",
    ],
  },
  {
    title: "Tenancy isolation options",
    icon: Layers,
    points: [
      "Shared number + prefix routing — cheapest, fine for low volume",
      "Twilio Subaccounts per client — clean billing, own logs, own number",
      "Client brings their own Twilio — zero liability, lower revenue",
      "Pick per scenario: emergency clients → subaccount, hobby clients → shared",
    ],
  },
  {
    title: "AI agent layer (heavy / autonomous)",
    icon: Sparkles,
    points: [
      "Reads every inbound message in context of tenant + customer history",
      "Classifies intent (book / cancel / complain / emergency / question)",
      "Looks up customer in Supabase, pulls last 90 days of context",
      "Drafts reply in tenant's brand voice (configured per client)",
      "Takes actions: book slot, dispatch tech, send invoice, escalate",
      "Confidence threshold — hands off to human via Slack/SMS if unsure",
      "Learns per tenant from human corrections",
    ],
  },
  {
    title: "Client dashboard (white-label)",
    icon: Bot,
    points: [
      "Conversation inbox (all channels in one view)",
      "Workflow editor (visual or JSON)",
      "Brand voice + FAQ config",
      "Usage stats, message volume, AI hand-off rate",
      "Billing portal with Stripe",
    ],
  },
];

const PRICING_TIERS = [
  { tier: "Starter", price: "$29/mo", includes: "500 SMS, 1 workflow, shared number, AI off" },
  { tier: "Pro", price: "$99/mo", includes: "2,500 SMS, 5 workflows, dedicated number, AI replies on" },
  { tier: "Emergency", price: "$199/mo", includes: "Unlimited*, on-call rotation, voice fallback, 24/7 AI" },
  { tier: "Custom Enterprise", price: "$499+/mo", includes: "Subaccount, video, recording, compliance, white-label dashboard" },
];

const TOP_3 = [
  {
    name: "AI Receptionist",
    why: "Universal — every small business needs phone coverage after hours. Voice + SMS + AI = killer combo.",
    estimate: "30 clients × $99 = $36k ARR per agency",
  },
  {
    name: "Senior Safety / CheckOnMe",
    why: "Emotional sell. Family pays, recurring forever, near-zero churn. Boomer kids have credit cards.",
    estimate: "100 families × $29 = $34k ARR",
  },
  {
    name: "Telehealth-in-a-Box",
    why: "Therapists are desperate for HIPAA-flavored video + transcription. Willing to pay $150+/mo.",
    estimate: "20 clinicians × $149 = $35k ARR",
  },
];

const SHIP_SEQUENCE = [
  "Pick ONE flagship vertical and ship a public demo on BlackBoxFarm (e.g. EmergencyDispatch.blackbox.farm).",
  "Wire it to your existing Twilio account as proof — make it real, not mocked.",
  "Extract reusable parts: tenant table, workflow JSON shape, AI router, webhook receiver.",
  "Templatize: each new vertical = JSON workflow file + landing page copy, not new code.",
  "Sell to existing website clients first ($99/mo × 10 = $12k/yr passive income).",
  "Add a vertical every 2 weeks. After 6 verticals you have a full product line.",
];

export default function TwilioIdeas() {
  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-10 max-w-6xl">
        {/* Hero */}
        <header className="mb-12 border-b border-border pb-8">
          <Badge variant="outline" className="mb-3">Discussion · Working Document</Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Twilio × Lovable × AI
          </h1>
          <p className="text-xl text-muted-foreground mb-2">
            A repackaging playbook for small-business website owners and AI-savvy clients alike.
          </p>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Everything we've spitballed, organized for slow reading. Skim the capabilities, browse
            the vertical plays, look at the platform layers, then check the "ship sequence" at the
            bottom for how to actually start.
          </p>
        </header>

        {/* TL;DR */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Rocket className="h-6 w-6 text-primary" />
            TL;DR — The Big Idea
          </h2>
          <Card>
            <CardContent className="pt-6 space-y-3 text-sm md:text-base leading-relaxed">
              <p>
                You already build websites for clients. <strong>Bolt on a Twilio-powered SMS / Voice / Video
                / Email layer</strong> as a recurring-revenue add-on. Wrap each Twilio capability with a
                heavy AI agent that handles 90% of conversations autonomously in the client's brand voice.
              </p>
              <p>
                Each "product" is a thin JSON workflow on top of a shared multi-tenant backbone. One
                codebase, dozens of vertical-specific landing pages, recurring revenue per client.
              </p>
              <p className="text-muted-foreground">
                Country community website owners get: phone coverage they never had, no missed calls,
                no missed leads. AI-savvy clients get: an SMS/voice agent that actually understands
                their business.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Capabilities */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" />
            The Twilio Buffet — Every Capability + How to Resell It
          </h2>
          <p className="text-muted-foreground mb-6">
            Not just SMS. Twilio is a full communications platform. Here's everything they offer and
            how each piece becomes a sellable service.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            {CAPABILITIES.map((cap) => {
              const Icon = cap.icon;
              return (
                <Card key={cap.name} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-md bg-primary/10 text-primary shrink-0">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{cap.name}</CardTitle>
                        <CardDescription className="mt-1">{cap.blurb}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                      Repackage as:
                    </p>
                    <ul className="text-sm space-y-1.5">
                      {cap.resell.map((r, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-primary mt-0.5">→</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Verticals */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Vertical Plays — Pre-Built Product Templates
          </h2>
          <p className="text-muted-foreground mb-6">
            Each one is a templated workflow you can sell to a category of business. Click to expand
            the full pitch, flow, Twilio capabilities used, AI role, and pricing.
          </p>
          <Accordion type="multiple" className="space-y-2">
            {VERTICALS.map((v) => {
              const Icon = v.icon;
              return (
                <AccordionItem
                  key={v.name}
                  value={v.name}
                  className="border border-border rounded-lg px-4 bg-card"
                >
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3 text-left">
                      <div className="p-2 rounded-md bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-semibold">{v.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {v.productNames.join(" · ")}
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-2">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Pain</p>
                      <p className="text-sm">{v.pain}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Flow</p>
                      <ol className="text-sm space-y-1 list-decimal list-inside marker:text-primary">
                        {v.flow.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </div>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Twilio</p>
                        <div className="flex flex-wrap gap-1">
                          {v.twilio.map((t) => (
                            <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">AI Role</p>
                        <p className="text-sm">{v.ai}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Pricing</p>
                        <p className="text-sm font-medium">{v.pricing}</p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </section>

        {/* Platform layers */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" />
            Platform Layers — What You Actually Build Once
          </h2>
          <p className="text-muted-foreground mb-6">
            The reusable backbone. Build these four things once, then every new vertical is mostly
            configuration.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            {PLATFORM_LAYERS.map((layer) => {
              const Icon = layer.icon;
              return (
                <Card key={layer.title}>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      {layer.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-sm space-y-1.5">
                      {layer.points.map((p, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-primary mt-0.5">•</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Pricing */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            Pricing Model
          </h2>
          <p className="text-muted-foreground mb-6">
            One pricing chart that works across every vertical. Adjust margins per industry.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {PRICING_TIERS.map((p) => (
              <Card key={p.tier}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">{p.tier}</CardTitle>
                  <div className="text-2xl font-bold text-primary">{p.price}</div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{p.includes}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Top 3 */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            If You Could Only Build 3 — These Three
          </h2>
          <p className="text-muted-foreground mb-6">
            Highest-margin, lowest-objection, fastest-to-recurring-revenue picks.
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            {TOP_3.map((t, i) => (
              <Card key={t.name} className="relative">
                <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                  {i + 1}
                </div>
                <CardHeader>
                  <CardTitle>{t.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">{t.why}</p>
                  <div className="text-xs text-muted-foreground border-t border-border pt-2">
                    <span className="font-medium text-foreground">Napkin math:</span> {t.estimate}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Ship sequence */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
            <Rocket className="h-6 w-6 text-primary" />
            Ship Sequence — How to Actually Start
          </h2>
          <Card>
            <CardContent className="pt-6">
              <ol className="space-y-3">
                {SHIP_SEQUENCE.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                      {i + 1}
                    </span>
                    <span className="text-sm pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </section>

        {/* Closing */}
        <footer className="border-t border-border pt-6 text-sm text-muted-foreground">
          <p>
            Working document — peruse, mark up, kill bad ideas, double down on good ones.
            When you're ready to pick one and build it, we draft a real implementation plan together.
          </p>
        </footer>
      </div>
    </SiteLayout>
  );
}