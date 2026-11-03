/**
 * Golden fixtures: the three worked `cinematic_hero_stage` instances from
 * deepseek round 7 §4.2–4.4, verbatim except that the placeholder CDN host
 * (`https://cdn/…/`) is a real-looking https host so the URL checks run.
 * Tests hold the schema and renderer to these; do not edit them to make a
 * failing change pass.
 */
export const DETAILER_HERO_STAGE = {
  "kind": "cinematic_hero_stage",
  "id": "hero-detailing-01",
  "signature": {
    "verb": "scroll/scrub",
    "oneLiner": "the one where raking light travels across the paint and finds the swirls",
    "bespokeTestPassed": true,
    "mediumArbitration": "displayed-real-media"
  },
  "stage": {
    "height": "screen",
    "pin": {
      "enabled": true,
      "distance": "medium"
    },
    "perspective": false
  },
  "layers": [
    {
      "type": "ambient",
      "id": "amb-1",
      "channel": "translate",
      "washes": [
        {
          "color": "var(--amber-04)",
          "at": "70% 18%",
          "radius": "ellipse 80% 60%",
          "opacity": 0.12
        }
      ]
    },
    {
      "type": "media_stack",
      "id": "paint",
      "channel": "opacity",
      "frames": [
        {
          "src": "https://cdn.revora.test/hero/car-01.webp",
          "alt": "Detailer's bay, before correction",
          "focal": [
            0.5,
            0.6
          ]
        },
        {
          "src": "https://cdn.revora.test/hero/car-02.webp",
          "alt": "Same panel under raking light"
        },
        {
          "src": "https://cdn.revora.test/hero/car-03.webp",
          "alt": "Swirl marks visible at low angle"
        },
        {
          "src": "https://cdn.revora.test/hero/car-04.webp",
          "alt": "After two-stage correction"
        },
        {
          "src": "https://cdn.revora.test/hero/car-05.webp",
          "alt": "Reflection sharpens on the hood"
        },
        {
          "src": "https://cdn.revora.test/hero/car-06.webp",
          "alt": "Final gloss under inspection lamp"
        }
      ],
      "compositing": "overlay",
      "holdFraction": 0.45,
      "promotedWindow": 3,
      "scrub": {
        "range": [
          0.1,
          0.92
        ]
      },
      "source": "owner_upload",
      "productPixels": "real"
    },
    {
      "type": "light_sweep",
      "id": "sweep",
      "channel": "translate",
      "angleDeg": 102,
      "widthPct": 22,
      "color": "var(--amber-02)",
      "opacity": 0.28,
      "mask": "image-luminance"
    },
    {
      "type": "scrim",
      "id": "scrim",
      "channel": "none",
      "direction": "to-top",
      "strength": 0.78,
      "token": "var(--scrim-strong)"
    },
    {
      "type": "grain",
      "id": "grain",
      "channel": "none",
      "opacity": 0.18,
      "blend": "overlay",
      "animate": false
    }
  ],
  "lockup": {
    "eyebrow": {
      "text": "Paint correction · ceramic coating",
      "style": "overline"
    },
    "headline": {
      "text": "Your paint, under a light you can finally stand.",
      "emphasis": [
        {
          "word": "light",
          "effect": "clip-wipe"
        }
      ]
    },
    "sub": {
      "text": "Two-stage correction and a nine-year ceramic, in one bay, in one day."
    },
    "cta": {
      "label": "See a corrected panel",
      "href": "/book",
      "secondary": "Call the bay"
    },
    "placement": "bottom-left",
    "maxWidthCh": 20
  },
  "motion": {
    "reveals": [
      {
        "target": "lockup.headline",
        "effect": "mask-line",
        "delayMs": 120,
        "durationMs": 820,
        "easing": "expo.out",
        "once": true
      },
      {
        "target": "lockup.sub",
        "effect": "rise",
        "delayMs": 340,
        "durationMs": 620,
        "easing": "power3.out",
        "once": true
      }
    ],
    "scrubs": [
      {
        "target": "sweep",
        "property": "translateX",
        "from": "-30%",
        "to": "130%",
        "range": [
          0,
          0.62
        ],
        "easing": "none"
      },
      {
        "target": "paint",
        "property": "frameIndex",
        "from": 0,
        "to": 5,
        "range": [
          0.1,
          0.92
        ],
        "easing": "linear"
      },
      {
        "target": "amb-1",
        "property": "translateY",
        "from": 0,
        "to": -18,
        "range": [
          0,
          1
        ],
        "easing": "none"
      }
    ]
  },
  "responsive": {
    "typeScale": {
      "min": "320px",
      "max": "2560px"
    },
    "narrow": {
      "lockup": "stacked-left",
      "headlineToken": "--step-6",
      "mediaAspect": "4/5",
      "stageHeight": "88svh",
      "showLayers": [
        "paint",
        "scrim",
        "grain"
      ]
    },
    "mid": {
      "lockup": "bottom-left",
      "headlineToken": "--display-1",
      "mediaAspect": "3/2",
      "stageHeight": "100svh"
    },
    "wide": {
      "lockup": "bottom-left",
      "headlineToken": "--display-2",
      "mediaAspect": "16/9",
      "stageHeight": "100svh"
    },
    "disableOnMobile": [
      "sweep"
    ]
  },
  "a11y": {
    "reducedMotion": "static-poster",
    "contrastCheckedAt": [
      0,
      0.5,
      1
    ]
  },
  "guardrails": {
    "maxPromotedLayers": 4,
    "maxScrollChapters": 2,
    "polishPatternsUsed": 1
  },
  "stamp": "/* revora · macrostructure: Photographic · signature: raking light finds the swirls */"
} as const;

export const PLUMBER_HERO_STAGE = {
  "kind": "cinematic_hero_stage",
  "id": "hero-plumbing-01",
  "signature": {
    "verb": "scroll/scrub",
    "oneLiner": "the one where you trace the pipe through the wall until you reach the leak",
    "bespokeTestPassed": true,
    "mediumArbitration": "css-choreography"
  },
  "stage": {
    "height": "screen-tall",
    "pin": {
      "enabled": true,
      "distance": "long"
    },
    "perspective": false
  },
  "layers": [
    {
      "type": "media_single",
      "id": "wall",
      "channel": "scale",
      "src": "https://cdn.revora.test/hero/cutaway-wall.webp",
      "alt": "Cutaway of a wall showing supply and waste lines",
      "kind": "photo",
      "scrubVideo": false,
      "objectFit": "cover"
    },
    {
      "type": "rule_path",
      "id": "route",
      "channel": "clip",
      "d": "M 12 78 C 26 64, 34 60, 44 52 S 58 40, 66 30 S 78 22, 88 18",
      "stroke": "var(--amber-01)",
      "strokeWidth": 2.5,
      "drawRange": [
        0.08,
        0.74
      ]
    },
    {
      "type": "scrim",
      "id": "scrim",
      "channel": "none",
      "direction": "to-right",
      "strength": 0.82,
      "token": "var(--scrim-strong)"
    },
    {
      "type": "grain",
      "id": "grain",
      "channel": "none",
      "opacity": 0.15,
      "blend": "overlay",
      "animate": false
    }
  ],
  "lockup": {
    "eyebrow": {
      "text": "Emergency plumbing · 24/7",
      "style": "overline"
    },
    "headline": {
      "text": "We don't guess where the water is coming from."
    },
    "sub": {
      "text": "Thermal and acoustic locating before anyone opens a wall. Most leaks found in under an hour."
    },
    "cta": {
      "label": "Get a leak located",
      "href": "/book",
      "secondary": "Call now"
    },
    "placement": "split-left",
    "maxWidthCh": 24
  },
  "motion": {
    "reveals": [
      {
        "target": "lockup.headline",
        "effect": "clip-wipe-up",
        "delayMs": 80,
        "durationMs": 760,
        "easing": "expo.out",
        "once": true
      }
    ],
    "scrubs": [
      {
        "target": "route",
        "property": "pathDraw",
        "from": 0,
        "to": 1,
        "range": [
          0.08,
          0.74
        ],
        "easing": "none"
      },
      {
        "target": "wall",
        "property": "scale",
        "from": 1.06,
        "to": 1.0,
        "range": [
          0,
          0.8
        ],
        "easing": "none"
      }
    ]
  },
  "responsive": {
    "typeScale": {
      "min": "320px",
      "max": "2560px"
    },
    "narrow": {
      "lockup": "stacked-left",
      "headlineToken": "--step-7",
      "mediaAspect": "4/5",
      "stageHeight": "88svh"
    },
    "mid": {
      "lockup": "split-left",
      "headlineToken": "--display-1",
      "mediaAspect": "3/2",
      "stageHeight": "100svh"
    },
    "wide": {
      "lockup": "split-left",
      "headlineToken": "--display-2",
      "mediaAspect": "16/9",
      "stageHeight": "100svh"
    },
    "disableOnMobile": []
  },
  "a11y": {
    "reducedMotion": "instant-reveal",
    "contrastCheckedAt": [
      0,
      0.6,
      1
    ]
  },
  "guardrails": {
    "maxPromotedLayers": 2,
    "maxScrollChapters": 2,
    "polishPatternsUsed": 1
  },
  "stamp": "/* revora · macrostructure: Split Studio · signature: trace the pipe to the leak */"
} as const;

export const MED_SPA_HERO_STAGE = {
  "kind": "cinematic_hero_stage",
  "id": "hero-medspa-01",
  "signature": {
    "verb": "ambient/no-input",
    "oneLiner": "the one where the room slowly breathes into light as you arrive",
    "bespokeTestPassed": true,
    "mediumArbitration": "displayed-real-media"
  },
  "stage": {
    "height": "screen",
    "pin": {
      "enabled": false,
      "distance": "none"
    },
    "perspective": false
  },
  "layers": [
    {
      "type": "ambient",
      "id": "amb-1",
      "channel": "translate",
      "washes": [
        {
          "color": "var(--warm-03)",
          "at": "28% 14%",
          "radius": "ellipse 78% 62%",
          "opacity": 0.13
        },
        {
          "color": "var(--warm-05)",
          "at": "76% 78%",
          "radius": "ellipse 64% 54%",
          "opacity": 0.1
        }
      ],
      "drift": {
        "x": 10,
        "y": 14,
        "periodMs": 22000
      }
    },
    {
      "type": "media_stack",
      "id": "room",
      "channel": "opacity",
      "frames": [
        {
          "src": "https://cdn.revora.test/hero/room.webp",
          "alt": "Treatment room at golden hour"
        },
        {
          "src": "https://cdn.revora.test/hero/hands.webp",
          "alt": "Practitioner's hands, gloved, mid-treatment"
        },
        {
          "src": "https://cdn.revora.test/hero/detail.webp",
          "alt": "Close detail of the device head"
        },
        {
          "src": "https://cdn.revora.test/hero/result.webp",
          "alt": "Client resting after treatment"
        }
      ],
      "compositing": "overlay",
      "holdFraction": 0.62,
      "promotedWindow": 3,
      "scrub": {
        "range": [
          0.05,
          0.88
        ]
      },
      "source": "owner_upload",
      "productPixels": "real"
    },
    {
      "type": "scrim",
      "id": "scrim",
      "channel": "none",
      "direction": "radial",
      "strength": 0.74,
      "token": "var(--scrim-soft)"
    },
    {
      "type": "grain",
      "id": "grain",
      "channel": "none",
      "opacity": 0.12,
      "blend": "soft-light",
      "animate": false
    }
  ],
  "lockup": {
    "eyebrow": {
      "text": "Skin · 30 minutes · No downtime",
      "style": "overline"
    },
    "headline": {
      "text": "The quietest hour of your month."
    },
    "sub": {
      "text": "Medical-grade skin treatments in a room designed to make you forget the waiting list."
    },
    "cta": {
      "label": "Book a consultation",
      "href": "/book"
    },
    "placement": "stacked-center",
    "maxWidthCh": 18
  },
  "motion": {
    "reveals": [
      {
        "target": "lockup.headline",
        "effect": "iris-open",
        "delayMs": 260,
        "durationMs": 1100,
        "easing": "quart.out",
        "once": true
      },
      {
        "target": "lockup.sub",
        "effect": "rise",
        "delayMs": 620,
        "durationMs": 700,
        "easing": "power3.out",
        "once": true
      }
    ],
    "scrubs": [
      {
        "target": "room",
        "property": "frameIndex",
        "from": 0,
        "to": 3,
        "range": [
          0.05,
          0.88
        ],
        "easing": "linear"
      },
      {
        "target": "amb-1",
        "property": "translateY",
        "from": 0,
        "to": -22,
        "range": [
          0,
          1
        ],
        "easing": "none"
      }
    ]
  },
  "responsive": {
    "typeScale": {
      "min": "320px",
      "max": "2560px"
    },
    "narrow": {
      "lockup": "stacked-center",
      "headlineToken": "--step-6",
      "mediaAspect": "4/5",
      "stageHeight": "88svh"
    },
    "mid": {
      "lockup": "stacked-center",
      "headlineToken": "--display-1",
      "mediaAspect": "1/1",
      "stageHeight": "100svh"
    },
    "wide": {
      "lockup": "stacked-center",
      "headlineToken": "--display-2",
      "mediaAspect": "16/9",
      "stageHeight": "100svh"
    },
    "disableOnMobile": []
  },
  "a11y": {
    "reducedMotion": "static-poster",
    "contrastCheckedAt": [
      0,
      0.4,
      1
    ]
  },
  "guardrails": {
    "maxPromotedLayers": 4,
    "maxScrollChapters": 1,
    "polishPatternsUsed": 1
  },
  "stamp": "/* revora · macrostructure: Photographic · signature: the room breathes into light */"
} as const;

export const HERO_STAGE_GOLDEN = { detailer: DETAILER_HERO_STAGE, plumber: PLUMBER_HERO_STAGE, medSpa: MED_SPA_HERO_STAGE } as const;
