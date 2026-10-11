/**
 * ---------------------------------------------------------------------------
 * SINGLE SOURCE OF TRUTH FOR ALL COPY ON THE SITE.
 * ---------------------------------------------------------------------------
 * No component may hard-code user-facing text. Types are exported so the UI
 * stays honest about what a station may contain.
 * ---------------------------------------------------------------------------
 */

export type StationId =
  | 'hero'
  | 'about'
  | 'experience'
  | 'freelance'
  | 'research'
  | 'achievements'
  | 'contact';

export interface SocialLink {
  label: string;
  href: string;
  /** Key used to pick an inline SVG in the icon registry. */
  icon: 'linkedin' | 'github' | 'scholar' | 'mail';
}

export interface Identity {
  name: string;
  title: string;
  location: string;
  email: string;
  links: SocialLink[];
  /** Phone number is intentionally never published. */
  phonePublished: false;
}

export interface SkillGroup {
  id: string;
  label: string;
  /** One-line framing shown above the tiles. */
  blurb: string;
  skills: { name: string; detail: string }[];
}

export interface ExperienceRole {
  company: string;
  role: string;
  period: string;
  workMode: string;
  location: string;
  projects: { name: string; summary: string; highlights: string[] }[];
  /** Tags rendered as compact chips. */
  stack: string[];
}

export interface FreelanceProject {
  id: string;
  title: string;
  /** TODO(owner): replace the placeholder line with a real one-line summary. */
  description: string;
  role: string;
  /** Short chips: platform, language, notable library. Never metrics. */
  tags: string[];
  outcomes: string[];
  link?: string;
  linkLabel?: string;
  /** TODO(owner): drop an image at public/images/<id>.png to show it. */
  image?: string;
  /** True while the copy above is still a TODO. Drives the dev-only badge. */
  placeholder: boolean;
}

export interface Publication {
  id: string;
  title: string;
  venue?: string;
  year?: string;
  /** TODO(owner): add the DOI / publisher URL once available. */
  url?: string;
}

export interface Achievement {
  id: string;
  title: string;
  issuer: string;
  year?: string;
}

export interface EducationRecord {
  id: string;
  qualification: string;
  institution: string;
  period: string;
  score: string;
}

interface StationBase {
  id: StationId;
  /** Short label for nav / minimap. */
  navLabel: string;
  eyebrow: string;
  /** Heading that starts the station block (h2 in the document outline). */
  heading: string;
  /** Screen-reader / SEO friendly plain-text summary. */
  srSummary: string;
}

export interface HeroStation extends StationBase {
  id: 'hero';
  /** One line, derived from SUMMARY — not a second summary. */
  tagline: string;
  summary: string;
  scrollHint: string;
  cta: { label: string; targetId: StationId };
}

export interface AboutStation extends StationBase {
  id: 'about';
  paragraphs: string[];
  skillGroups: SkillGroup[];
}

export interface ExperienceStation extends StationBase {
  id: 'experience';
  roles: ExperienceRole[];
}

export interface FreelanceStation extends StationBase {
  id: 'freelance';
  note: string;
  projects: FreelanceProject[];
}

export interface ResearchStation extends StationBase {
  id: 'research';
  intro: string;
  domainTags: string[];
  publications: Publication[];
  scholarLink: SocialLink;
}

export interface AchievementsStation extends StationBase {
  id: 'achievements';
  achievements: Achievement[];
  community: { id: string; title: string; detail: string }[];
  education: { label: string; records: EducationRecord[] }[];
  languages: { label: string; items: string[] };
}

export interface ContactStation extends StationBase {
  id: 'contact';
  intro: string;
  email: string;
  mailtoSubject: string;
  socials: SocialLink[];
  closing: string;
}

export type Station =
  | HeroStation
  | AboutStation
  | ExperienceStation
  | FreelanceStation
  | ResearchStation
  | AchievementsStation
  | ContactStation;

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

export const IDENTITY: Identity = {
  name: 'Hrithik Paul',
  title: 'Software Engineer | AI/LLM Engineer',
  location: 'West Bengal, India',
  email: 'hrithikpaul2001@gmail.com',
  phonePublished: false,
  links: [
    {
      label: 'LinkedIn',
      href: 'https://linkedin.com/in/hrithik-paul',
      icon: 'linkedin',
    },
    { label: 'GitHub', href: 'https://github.com/HRX101', icon: 'github' },
    {
      label: 'Google Scholar',
      href: 'https://scholar.google.com/citations?user=6trgpjYAAAAJ',
      icon: 'scholar',
    },
    { label: 'Email', href: 'mailto:hrithikpaul2001@gmail.com', icon: 'mail' },
  ],
};

export const SUMMARY =
  'AI/LLM engineer experienced in building production-grade conversational systems, agentic workflows, enterprise analytics interfaces, and machine-learning solutions. Skilled in LangGraph, MCP, agent-to-agent (A2A) systems, LLM tool calling, retrieval, vector search, and backend development. Published researcher across medical AI, explainable AI, computer vision, NLP, audio intelligence, and biometrics.';

/* -------------------------------------------------------------------------- */
/* Stations                                                                    */
/* -------------------------------------------------------------------------- */

export const STATIONS: readonly Station[] = [
  /* ---------------------------------------------------------------- hero -- */
  {
    id: 'hero',
    navLabel: 'Intro',
    eyebrow: 'Portfolio',
    heading: 'Hrithik Paul',
    srSummary:
      'Hrithik Paul, Software Engineer and AI/LLM Engineer based in West Bengal, India.',
    // Condensed from the opening of SUMMARY and the second About paragraph, so
    // it adds no claim the longer copy does not already make.
    tagline: 'Conversational AI, agentic workflows and machine learning, built end to end.',
    summary: SUMMARY,
    scrollHint: 'Scroll to ride',
    cta: { label: 'Get in touch', targetId: 'contact' },
  },

  /* --------------------------------------------------------------- about -- */
  {
    id: 'about',
    navLabel: 'About',
    eyebrow: 'About & Skills',
    heading: 'Building AI systems that survive production',
    srSummary:
      'About Hrithik Paul, plus skill clusters in programming, generative AI and agents, machine learning, backend and data, databases and search, and cloud tooling.',
    paragraphs: [
      SUMMARY,
      'I work end to end: from model orchestration and retrieval layers to the APIs, databases and dashboards that put them in front of real users.',
    ],
    skillGroups: [
      {
        id: 'programming',
        label: 'Programming',
        blurb: 'Everyday languages for services, pipelines and tooling.',
        skills: [
          { name: 'Python', detail: 'Primary language for ML, data and agent workflows.' },
          { name: 'Java', detail: 'JVM and object-oriented backend development.' },
          { name: 'Go', detail: 'Concurrent services and command-line tooling.' },
          { name: 'Node.js', detail: 'JavaScript runtime for APIs and build tooling.' },
        ],
      },
      {
        id: 'genai',
        label: 'Generative AI & Agents',
        blurb: 'Orchestration, retrieval and tool use on top of frontier models.',
        skills: [
          { name: 'LangGraph', detail: 'Stateful graph orchestration for LLM agents.' },
          { name: 'LangChain', detail: 'Composable chains, tools and retrievers.' },
          {
            name: 'MCP (Model Context Protocol)',
            detail: 'Open protocol that exposes tools and data to model clients.',
          },
          {
            name: 'A2A (agent-to-agent)',
            detail: 'Agent-to-agent messaging for delegated, multi-step tasks.',
          },
          { name: 'RAG', detail: 'Retrieval-augmented generation over private corpora.' },
          {
            name: 'Prompt engineering',
            detail: 'Prompt design, evaluation and iteration against real tasks.',
          },
          { name: 'LLM tool calling', detail: 'Structured function calling driven by model output.' },
          { name: 'AI agents', detail: 'Loops that plan, call tools, verify and hand back results.' },
          { name: 'NLP', detail: 'Language understanding, generation and classification.' },
          { name: 'Vector search', detail: 'Embedding similarity search over document chunks.' },
          { name: 'OpenAI', detail: 'GPT model APIs plus surrounding tooling.' },
          { name: 'Claude', detail: 'Anthropic model APIs and prompting patterns.' },
          { name: 'Gemini', detail: 'Google multimodal model APIs.' },
          { name: 'Llama', detail: 'Open-weight Meta models, hosted and local.' },
          { name: 'Ollama', detail: 'Running open-weight models locally.' },
        ],
      },
      {
        id: 'ml',
        label: 'Machine Learning',
        blurb: 'Modelling, representation learning and interpretability.',
        skills: [
          { name: 'TensorFlow', detail: 'Production and research deep-learning framework.' },
          { name: 'PyTorch', detail: 'Flexible research framework with eager execution.' },
          { name: 'scikit-learn', detail: 'Classical supervised and unsupervised estimators.' },
          { name: 'CNN', detail: 'Convolutional networks for image features and detection.' },
          { name: 'LSTM', detail: 'Recurrent networks for sequence and audio modelling.' },
          { name: 'GAN', detail: 'Adversarial generator/discriminator training.' },
          { name: 'MLP', detail: 'Fully connected feed-forward networks.' },
          { name: 'Autoencoders', detail: 'Compressed learned representations, e.g. shape-focused.' },
          {
            name: 'Anomaly detection',
            detail: 'Unsupervised outlier discovery in network traffic logs.',
          },
          { name: 'Explainable AI', detail: 'Interpretable models and attribution for clinical/agricultural use.' },
          { name: 'Data preprocessing', detail: 'Cleaning, normalisation, encoding and imputation.' },
          { name: 'Feature engineering', detail: 'Crafting discriminative inputs for classical models.' },
        ],
      },
      {
        id: 'backend',
        label: 'Backend & Data',
        blurb: 'Typed services and the dataframe work that feeds them.',
        skills: [
          { name: 'FastAPI', detail: 'Typed, async Python APIs with automatic docs.' },
          // Node.js is listed by the owner under Programming; not repeated here.
          { name: 'Pandas', detail: 'Dataframes for tabular analysis and ETL work.' },
          { name: 'NumPy', detail: 'N-dimensional arrays and vectorised numerics.' },
          { name: 'REST APIs', detail: 'Resource-oriented HTTP interfaces and versioning.' },
          { name: 'Data visualization', detail: 'Dashboards and exploratory charting for stakeholders.' },
        ],
      },
      {
        id: 'data',
        label: 'Databases & Search',
        blurb: 'Relational storage plus retrieval and search layers.',
        skills: [
          { name: 'MySQL', detail: 'Relational storage for application data.' },
          { name: 'PostgreSQL', detail: 'Relational storage with strong SQL and extensions.' },
          { name: 'Redis', detail: 'In-memory caching, queues and rate limiting.' },
          { name: 'Firebase', detail: 'Realtime document store and serverless functions.' },
          { name: 'Supabase', detail: 'Postgres platform with auth and storage.' },
          { name: 'Qdrant', detail: 'Vector database for embedding search.' },
          { name: 'ChromaDB', detail: 'Lightweight local vector store for retrieval.' },
          { name: 'Elasticsearch', detail: 'Full-text search, indexing and aggregations.' },
          { name: 'OpenSearch', detail: 'Search and analytics over logs and documents.' },
        ],
      },
      {
        id: 'cloud',
        label: 'Cloud & Tools',
        blurb: 'Where the work runs, and how it ships and gets traced.',
        skills: [
          { name: 'GCP', detail: 'Google Cloud deployment and managed services.' },
          { name: 'Docker', detail: 'Containerised builds and local parity.' },
          { name: 'Linux', detail: 'Shell fluency, services and diagnostics.' },
          { name: 'Git', detail: 'Branching, review and release workflows.' },
          { name: 'Kibana', detail: 'Operational dashboards over indexed logs.' },
          { name: 'pfSense', detail: 'Firewall and network appliance administration.' },
          { name: 'Jira', detail: 'Issue tracking and sprint planning.' },
          { name: 'Confluence', detail: 'Requirements and documentation.' },
          { name: 'Polarion', detail: 'Requirements and test-case management.' },
          { name: 'Cursor', detail: 'AI-assisted development in the editor.' },
          { name: 'OpenCode', detail: 'Agentic coding workflows in the terminal.' },
        ],
      },
    ],
  },

  /* --------------------------------------------------------- experience -- */
  {
    id: 'experience',
    navLabel: 'Experience',
    eyebrow: 'Experience',
    heading: 'Telaverge & Persistent Systems',
    srSummary:
      'Software Engineer at Telaverge Communication since December 2023, and Graduate Engineer Intern at Persistent Systems in 2023.',
    roles: [
      {
        company: 'Telaverge Communication',
        role: 'Software Engineer',
        period: 'Dec 2023 — Present',
        workMode: 'Remote',
        location: 'India',
        stack: ['LangGraph', 'GPT-4 / GPT-4 Turbo', 'Llama 3', 'MySQL', 'Elasticsearch', 'Kibana'],
        projects: [
          {
            name: 'TEL-COPILOT',
            summary: 'AI-powered workflow automation platform.',
            highlights: [
              'Built on GPT-4, GPT-4 Turbo and Llama 3 with prompt engineering.',
              'Wired prompt workflows against databases and APIs.',
            ],
          },
          {
            name: 'Enterprise analytics, in natural language',
            summary:
              'Conversational workflows that automate database queries, KPI retrieval, API/resource selection and calculations.',
            highlights: [
              'Turns a natural-language question into the right query or API call.',
              'Handles KPI retrieval and follow-up calculations across internal systems.',
            ],
          },
          {
            name: 'ZAI-Cortex',
            summary:
              'Umbrella conversational platform on LangGraph with MySQL and Elasticsearch.',
            highlights: [
              'Integrates A2A, MCP, OpenAI, Claude, prompt workflows and tool calling.',
              'Analyzes data and interacts with internal applications through the graph.',
            ],
          },
          {
            name: 'DocGen-TestGen',
            summary: 'AI test-case generator for QA teams.',
            highlights: [
              'Derives test cases from Jira features.',
              'Consumes requirements from Confluence and Polarion.',
            ],
          },
          {
            name: 'Network anomaly detection',
            summary: 'Unsupervised anomaly-detection model for pfSense network logs.',
            highlights: [
              'Surfaces anomalous behaviour without labelled data.',
              'Integrated into Kibana dashboards for operational monitoring.',
            ],
          },
        ],
      },
      {
        company: 'Persistent Systems',
        role: 'Graduate Engineer Intern',
        period: 'Jun 2023 — Aug 2023',
        workMode: 'Remote',
        location: 'India',
        stack: ['Linux', 'DSA', 'RDBMS', 'Python'],
        projects: [
          {
            name: 'Structured training',
            summary: 'Training in Linux, data structures and algorithms, RDBMS and Python.',
            highlights: ['Graded programme across core engineering fundamentals.'],
          },
          {
            name: 'Learning management system',
            summary: 'Contributed to an LMS during the internship.',
            highlights: ['Implemented a real-time course-enrollment feature.'],
          },
        ],
      },
    ],
  },

  /* ----------------------------------------------------------- freelance -- */
  {
    id: 'freelance',
    navLabel: 'Freelance',
    eyebrow: 'Freelance Work',
    heading: 'Client work',
    srSummary:
      'Freelance engagements including the Luvia Android app on Google Play and Nexarise.',
    note: 'Personal side projects are intentionally excluded — this section is client work only.',
    projects: [
      {
        id: 'luvia',
        title: 'Luvia',
        description:
          'Stylish GenAI app for hairstyle try-ons and AI wardrobe styling — preview a new look before committing to it.',
        role: 'Lead developer',
        tags: ['Android', 'Generative AI', 'Virtual Try-On'],
        outcomes: [
          'Live on Google Play with GenAI hairstyle previews and wardrobe styling flows.',
          'Leads development across the app release and its AI features.',
        ],
        link: 'https://play.google.com/store/apps/details?id=com.genconfi.luvia',
        linkLabel: 'Google Play',
        image: undefined,
        placeholder: false,
      },
      {
        id: 'nexarise',
        title: 'Nexarise',
        description:
          'Ongoing client engagement — designing and building across multiple projects.',
        role: 'Software Engineer',
        tags: ['Client Work', 'Multiple Projects'],
        outcomes: ['Ongoing delivery across project builds for a returning client.'],
        link: undefined,
        linkLabel: undefined,
        image: undefined,
        placeholder: false,
      },
    ],
  },

  /* ------------------------------------------------------------ research -- */
  {
    id: 'research',
    navLabel: 'Research',
    eyebrow: 'Research & Publications',
    heading: 'Published & ongoing research',
    srSummary:
      'Publications across medical AI, explainable AI, computer vision, NLP, audio intelligence and biometrics.',
    intro:
      'Research spans infectious-disease prediction, explainable agricultural vision, social-network analysis, mental-health voicebots, bioacoustics and ear biometrics.',
    domainTags: [
      'Medical AI',
      'Explainable AI',
      'Computer Vision',
      'NLP',
      'Audio Intelligence',
      'Biometrics',
    ],
    publications: [
      {
        id: 'medical-chatbot',
        title: 'AI-Based Medical Chatbot Model for Infectious Disease Prediction',
        venue: 'IEEE Access',
        year: '2022',
      },
      {
        id: 'potato-leaf-xai',
        title: 'Deep Learning Based Potato Leaf Disease Detection Using Explainable AI',
        venue: 'Springer',
        year: '2023',
      },
      {
        id: 'tweets-ga',
        title: 'Perception Analysis of Social Network Tweets Using Genetic Algorithm',
        year: '2024',
      },
      {
        id: 'voicebot-mental-health',
        title: 'Voicebot for Mental Disease Prediction and Treatment Recommendation Using Machine Learning',
      },
      {
        id: 'bird-sound-xai',
        title: 'Explainable AI for Bird Sound Species Recognition',
        year: '2024',
      },
      {
        id: 'ear-biometrics',
        title: 'Shape-Focused Autoencoder for Ear Biometrics',
      },
    ],
    scholarLink: {
      label: 'View all publications on Google Scholar',
      href: 'https://scholar.google.com/citations?user=6trgpjYAAAAJ',
      icon: 'scholar',
    },
  },

  /* -------------------------------------------------------- achievements -- */
  {
    id: 'achievements',
    navLabel: 'Achievements',
    eyebrow: 'Achievements, Education & Languages',
    heading: 'Awards & academic record',
    srSummary:
      'Hackathon and publication awards, Coding Club secretary at JIS University, plus B.Tech CGPA 9.32/10 and school results.',
    achievements: [
      {
        id: 'toycathon',
        title: 'Winner, National Hackathon Toycathon 2021-22',
        issuer: 'Toycathon',
        year: '2021-22',
      },
      {
        id: 'jis-samman',
        title: 'Best Project Award, JIS Samman',
        issuer: 'JIS University',
        year: '2022',
      },
      {
        id: 'ieee-best-paper',
        title: 'Best Paper Award, IEEE International Conference',
        issuer: 'IEEE',
        year: '2023',
      },
      {
        id: 'puraskar',
        title: 'Most Research Papers Award, JIS Puraskar',
        issuer: 'JIS University',
      },
      {
        id: 'book-journal',
        title: 'Best Book/Journal Publication Award',
        issuer: 'JIS University',
      },
    ],
    community: [
      {
        id: 'coding-club',
        title: 'Secretary, Coding Club — JIS University',
        detail: 'Organised coding competitions and hackathons.',
      },
      {
        id: 'event-organizer',
        title: 'University event organizer',
        detail: 'Coordinated university-level technical events.',
      },
    ],
    education: [
      {
        label: 'Degrees',
        records: [
          {
            id: 'btech',
            qualification: 'B.Tech, Computer Science & Engineering',
            institution: 'JIS University',
            period: '2020 — 2024',
            score: 'CGPA 9.32 / 10',
          },
        ],
      },
      {
        label: 'School',
        records: [
          {
            id: 'hsc',
            qualification: 'Higher Secondary (XII)',
            institution: 'WBCHSE',
            period: '2019 — 2020',
            score: '92.8%',
          },
          {
            id: 'ssc',
            qualification: 'Secondary (X)',
            institution: 'WBBSE',
            period: '2018',
            score: '86.4%',
          },
        ],
      },
    ],
    languages: { label: 'Languages', items: ['English', 'Hindi', 'Bengali'] },
  },

  /* ------------------------------------------------------------- contact -- */
  {
    id: 'contact',
    navLabel: 'Contact',
    eyebrow: 'Contact',
    heading: 'Let’s build something',
    srSummary:
      'Contact Hrithik Paul by email at hrithikpaul2001@gmail.com, or connect on LinkedIn, GitHub and Google Scholar.',
    intro:
      'Open to software engineering and AI/LLM engineering roles, and to freelance engagements. The fastest route is email.',
    email: 'hrithikpaul2001@gmail.com',
    mailtoSubject: 'Hello Hrithik — opportunity',
    socials: [
      {
        label: 'LinkedIn',
        href: 'https://linkedin.com/in/hrithik-paul',
        icon: 'linkedin',
      },
      { label: 'GitHub', href: 'https://github.com/HRX101', icon: 'github' },
      {
        label: 'Google Scholar',
        href: 'https://scholar.google.com/citations?user=6trgpjYAAAAJ',
        icon: 'scholar',
      },
    ],
    closing: 'Thanks for riding along.',
  },
];

/* -------------------------------------------------------------------------- */
/* Station lookup                                                              */
/* -------------------------------------------------------------------------- */
/**
 * Single accessor for station copy.
 *
 * Components never index into `STATIONS` themselves: they ask for a station by
 * id and get the exact union member back, so a section component is checked
 * against the data it actually renders and a missing id is a type error rather
 * than an `undefined` at runtime.
 */

const STATION_BY_ID: Record<StationId, Station> = Object.fromEntries(
  STATIONS.map((station) => [station.id, station]),
) as Record<StationId, Station>;

/** Station copy for an id. The id is always a known station, by construction. */
export function getStationContent(stationId: StationId): Station {
  return STATION_BY_ID[stationId];
}

/** Every station id, in ride order. */
export const STATION_IDS: readonly StationId[] = STATIONS.map((station) => station.id);

/** Index of a station id in ride order, or -1. */
export function stationIndexOf(stationId: StationId): number {
  return STATIONS.findIndex((station) => station.id === stationId);
}

/* -------------------------------------------------------------------------- */
/* Site chrome copy (nav, loader, fallback)                                     */
/* -------------------------------------------------------------------------- */

export const SITE_CHROME = {
  resume: { label: 'Resume', href: '/resume.pdf', note: 'TODO(owner): add public/resume.pdf' },
  skipToContent: 'Skip to content',
  loader: { title: 'Preparing the ride', hint: 'Loading scene assets…' },
  minimap: { label: 'Track minimap', hint: 'Jump to a station' },
  progress: { label: 'Journey progress' },
  audio: { enable: 'Enable ambient audio', disable: 'Mute ambient audio' },
  fallback: {
    heading: 'Hrithik Paul',
    note: 'Your browser or device could not start the 3D experience, so here is the same content in plain 2D.',
  },
  errors: {
    webglUnavailable: '3D unavailable',
  },
  /**
   * Interface labels. These are chrome, not biography: the only strings a
   * component is allowed to type itself. Everything else comes from the station
   * objects above.
   */
  ui: {
    nav: { label: 'Stations', home: 'Back to the start' },
    actions: {
      downloadResume: 'Download Resume',
      contact: 'Get in touch',
      copyEmail: 'Copy email address',
      copied: 'Copied',
      copyFailed: 'Copy failed — select the address instead',
      rideAgain: 'Ride again',
      backToTop: 'Back to top',
      showAll: 'Show all',
      showLess: 'Show less',
      viewProject: 'View project',
    },
    badges: {
      placeholder: 'placeholder',
    },
    labels: {
      education: 'Education',
    },
    detail: {
      hide: 'Hide detail',
      show: 'Show detail',
    },
    scrollCue: 'Scroll to ride',
  },
} as const;

export const SEO = {
  title: 'Hrithik Paul — Software Engineer | AI/LLM Engineer',
  description:
    'Portfolio of Hrithik Paul, Software Engineer and AI/LLM Engineer in West Bengal, India. LangGraph, MCP, agentic workflows, enterprise analytics, machine learning and published research in medical AI, explainable AI, computer vision, NLP and biometrics.',
  keywords: [
    'Hrithik Paul',
    'Software Engineer',
    'AI/LLM Engineer',
    'LangGraph',
    'MCP',
    'A2A',
    'RAG',
    'machine learning',
    'explainable AI',
  ],
  locale: 'en_IN',
  url: 'https://hrithikpaul.dev',
  image: '/og-image.png',
} as const;
