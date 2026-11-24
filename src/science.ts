// The research behind every rule the app uses. Shown on the "Why" screen.

export interface Principle {
  rule: string
  detail: string
  sources: { cite: string; url: string }[]
}

export const PRINCIPLES: Principle[] = [
  {
    rule: '10–20 hard sets per muscle per week',
    detail:
      'More weekly sets means more growth, with diminishing returns. Fewer than 10 sets a week leaves size on the table; above about 20, recovery usually becomes the limit. Compound lifts count as half a set for the helper muscles (for example, bench press gives triceps 0.5).',
    sources: [
      {
        cite: 'Schoenfeld, Ogborn & Krieger (2017), J Sports Sci: dose-response of weekly sets and hypertrophy',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Dose-response%20relationship%20between%20weekly%20resistance%20training%20volume%20and%20increases%20in%20muscle%20mass%20Schoenfeld',
      },
      {
        cite: 'Pelland et al. (2024), SportRxiv: the resistance training dose-response, meta-regression',
        url: 'https://scholar.google.com/scholar?q=The%20Resistance%20Training%20Dose-Response%20Pelland',
      },
    ],
  },
  {
    rule: 'Take sets to 0–3 reps from failure',
    detail:
      'Growth is greater the closer sets get to failure, but going all the way to failure on every set adds fatigue without clearly adding size. The app only counts sets logged at 3 reps in reserve or fewer as hard sets.',
    sources: [
      {
        cite: 'Refalo et al. (2023), Sports Med: proximity-to-failure and hypertrophy, meta-analysis',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Influence%20of%20Resistance%20Training%20Proximity-to-Failure%20on%20Skeletal%20Muscle%20Hypertrophy%20Refalo',
      },
      {
        cite: 'Robinson et al. (2024), Sports Med: proximity to failure dose-response meta-regression',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=proximity%20to%20failure%20dose-response%20meta-regression%20Robinson%202024',
      },
    ],
  },
  {
    rule: 'Any rep range from about 5 to 30 builds muscle',
    detail:
      'Heavy and light loads build similar muscle when sets are taken near failure. Straight sets progress inside 6–12 reps: add reps until you hit 12, then add weight. Heavy sets of 3–5 built as much muscle as sets of 10 when total volume matched, but needed more sets and caused more joint aches, so the app reminds you when a top set falls under 4 reps.',
    sources: [
      {
        cite: 'Schoenfeld et al. (2017), J Strength Cond Res: low vs. high load training, meta-analysis',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Strength%20and%20Hypertrophy%20Adaptations%20Between%20Low-%20vs.%20High-Load%20Resistance%20Training%20Schoenfeld',
      },
      {
        cite: 'Schoenfeld et al. (2014), J Strength Cond Res: 7×3 vs. 3×10 in trained men',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Effects%20of%20different%20volume-equated%20resistance%20training%20loading%20strategies%20on%20muscular%20adaptations%20in%20well-trained%20men',
      },
    ],
  },
  {
    rule: 'Pyramids (weight up, reps down) work as well as straight sets',
    detail:
      'In trained men, an ascending pyramid built the same muscle as straight sets with matched volume. The app treats your heaviest set as the top set: hit 8 reps on it and the next session suggests more weight; under 8, beat it by a rep. Lighter ramp-up sets logged as 4+ reps left count as warm-ups, not hard sets.',
    sources: [
      {
        cite: 'Angleri, Ugrinowitsch & Libardi (2017), Eur J Appl Physiol: crescent pyramid and drop-set vs. traditional training',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Crescent%20pyramid%20and%20drop-set%20systems%20do%20not%20promote%20greater%20strength%20gains%2C%20muscle%20hypertrophy%20Angleri',
      },
    ],
  },
  {
    rule: 'Hit each muscle at least twice a week',
    detail:
      'Training a muscle twice a week grew more muscle than once a week. When total weekly sets are equal, frequency matters less, but splitting the sets across two or more days makes 10–20 sets easier to do well.',
    sources: [
      {
        cite: 'Schoenfeld, Ogborn & Krieger (2016), Sports Med: training frequency and hypertrophy, meta-analysis',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Effects%20of%20Resistance%20Training%20Frequency%20on%20Measures%20of%20Muscle%20Hypertrophy%20Schoenfeld',
      },
      {
        cite: 'Schoenfeld, Grgic & Krieger (2019), J Sports Sci: frequency with volume equated',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=How%20many%20times%20per%20week%20should%20a%20muscle%20be%20trained%20to%20maximize%20muscle%20hypertrophy%20Schoenfeld',
      },
    ],
  },
  {
    rule: 'Favor exercises that load the muscle while it is stretched',
    detail:
      'In head-to-head studies, overhead triceps extensions grew the triceps far more than pushdowns, and seated leg curls (hips bent, hamstrings stretched) grew the hamstrings more than lying leg curls. When you have no history on a muscle, the workout builder picks these first. Lifts you already do still come first so you have numbers to beat.',
    sources: [
      {
        cite: 'Maeo et al. (2023), Eur J Sport Sci: overhead vs. neutral arm position triceps training',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Triceps%20brachii%20hypertrophy%20is%20substantially%20greater%20after%20elbow%20extension%20training%20performed%20in%20the%20overhead%20versus%20neutral%20arm%20position',
      },
      {
        cite: 'Maeo et al. (2021), Med Sci Sports Exerc: seated vs. prone leg curl',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Greater%20Hamstrings%20Muscle%20Hypertrophy%20but%20Similar%20Damage%20Protection%20after%20Training%20at%20Long%20versus%20Short%20Muscle%20Lengths',
      },
    ],
  },
  {
    rule: 'The split matters less than weekly sets',
    detail:
      'Push/pull/legs, upper/lower and full body build similar muscle when weekly sets per muscle match. Run push/pull/legs twice a week and each muscle gets trained twice. The workout builder sets about 6 sets for big muscles per session, so a full week lands near 12, and it trims or skips a muscle that has already hit 20.',
    sources: [
      {
        cite: 'Schoenfeld, Grgic & Krieger (2019), J Sports Sci: frequency with volume equated',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=How%20many%20times%20per%20week%20should%20a%20muscle%20be%20trained%20to%20maximize%20muscle%20hypertrophy%20Schoenfeld',
      },
    ],
  },
  {
    rule: 'Protein: about 1 g per lb of bodyweight',
    detail:
      'Gains from protein level off around 1.6 g/kg (0.73 g/lb), with the upper confidence limit at 2.2 g/kg (1 g/lb). The app targets the upper end so you are covered.',
    sources: [
      {
        cite: 'Morton et al. (2018), Br J Sports Med: protein supplementation and muscle, meta-analysis',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=A%20systematic%20review%2C%20meta-analysis%20and%20meta-regression%20of%20the%20effect%20of%20protein%20supplementation%20Morton',
      },
    ],
  },
  {
    rule: 'Gain 0.25–0.5% of bodyweight per week',
    detail:
      'A small surplus builds about as much muscle as a big one while adding far less fat. Beginners can sit near 0.5%; experienced lifters closer to 0.25%. The app sets calories for your chosen rate, then checks your real weight trend and adjusts.',
    sources: [
      {
        cite: 'Iraki et al. (2019), Sports: nutrition recommendations for bodybuilders in the off-season',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Nutrition%20Recommendations%20for%20Bodybuilders%20in%20the%20Off-Season%20Iraki',
      },
    ],
  },
  {
    rule: 'Cut at 0.25–0.75% of bodyweight per week',
    detail:
      'When losing fat, a slower rate keeps more muscle. Lifters losing about 0.7% a week kept or gained lean mass, while those losing 1.4% a week lost strength and some muscle. Reviews of natural lifters recommend 0.5–1% a week, at the slower end when you are already lean. Keep protein high and keep lifting hard.',
    sources: [
      {
        cite: 'Garthe et al. (2011), Int J Sport Nutr Exerc Metab: slow vs. fast weight loss in athletes',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Effect%20of%20two%20different%20weight-loss%20rates%20on%20body%20composition%20and%20strength%20and%20power-related%20performance%20in%20elite%20athletes%20Garthe',
      },
      {
        cite: 'Helms, Aragon & Fitschen (2014), J Int Soc Sports Nutr: evidence-based recommendations for natural bodybuilding contest preparation',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Evidence-based%20recommendations%20for%20natural%20bodybuilding%20contest%20preparation%3A%20nutrition%20and%20supplementation%20Helms',
      },
    ],
  },
  {
    rule: 'Calories learned from your own data',
    detail:
      'Formulas for maintenance calories can be off by hundreds of calories. After 2–3 weeks of logging food and weighing in, the app works out your real maintenance from what you ate and how your weight moved, then uses that instead of the formula.',
    sources: [
      {
        cite: 'Mifflin et al. (1990), Am J Clin Nutr: resting energy expenditure equation (starting estimate)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=A%20new%20predictive%20equation%20for%20resting%20energy%20expenditure%20in%20healthy%20individuals%20Mifflin',
      },
    ],
  },
  {
    rule: 'Lifting days get the calories the workout burned',
    detail:
      'Your daily target covers life outside the gym. On days you lift, the app adds the calories the session burned on top of resting: time spent on each exercise × its MET value × your bodyweight. Most lifting counts as 3.5 METs; squats and deadlifts count as 5. Time comes from Start lift / Finish, or from when you logged each set, with breaks over 15 minutes left out. These are estimates; the weight-trend check corrects any error over a few weeks.',
    sources: [
      {
        cite: 'Herrmann et al. (2024), J Sport Health Sci: 2024 Adult Compendium of Physical Activities (codes 02052, 02054)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/38242596/',
      },
    ],
  },
]
