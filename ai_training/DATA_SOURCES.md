# DATA_SOURCES.md

**Project:** HopHub — AI-powered rabbit ownership application
**Module:** 4 — Kit Growth Tracker
**Repository path:** `ai_training/DATA_SOURCES.md`
**Author:** Kodippilige Sahan Chathuranga Thilakarathna
**Supervisor:** Dr. Gayan Galhena
**Last updated:** 18 August 2026

---

## 1. Purpose of this document

This file records the provenance of every numerical value used to parameterise
the kit growth tracker. It exists so that any examiner can trace each constant
in `ai_training/generate_growth_dataset.py` back to a published, peer-reviewed
source.

It also exists to answer a specific criticism raised about an earlier module:
that the project relies on synthetic data. Section 7 addresses that directly.

---

## 2. What is derived from literature, and what is not

The growth tracker has two distinct components. They must not be conflated.

| Component | Data source | Fitted from |
|---|---|---|
| **Reference curve** | Published weight-by-age tables (Sections 3–5) | Literature means |
| **Personal deviation model** | The user's own recorded weights | Real user data only |

The reference curve is a Gompertz function fitted to published population means.
The personal model is a linear regression of an individual rabbit's deviation
from that reference, fitted at runtime to weights the owner actually recorded.

**No synthetic training set is generated for the personal model.** Synthetic
data is used only to test the pipeline and to seed demonstration accounts, and
is clearly flagged as such in the code.

---

## 3. Primary source — weekly weight-by-age with dispersion

**Pałka, S., Kmiecik, M., Migdał, Ł., Kozioł, K., Otwinowska-Mindur, A. &
Bieniek, J. (2018).** Effect of housing system and breed on growth, slaughter
traits and meat quality traits in rabbits. *Scientific Annals of the Polish
Society of Animal Production*, 14(4), 9–18.

- **Access:** Open access. University of Agriculture in Krakow.
- **Animals:** Blanc de Termonde (n = 34) and Popielno White (n = 28).
- **Protocol:** Weighed weekly, birth to 12 weeks. Weaned at 35 days. Fed
  commercial pellets ad libitum (10.2 MJ ME, 14% digestible fibre,
  16.5% crude protein).
- **Statistics:** SAS PROC MIXED; Tukey-Kramer; p ≤ 0.05.

### 3.1 Extracted reference table (Table 1, by housing system)

Body weight in grams, mean ± SD.

| Age | Battery (n=42) | Box (n=20) |
|---|---|---|
| Birth | 71 ± 8 | 61 ± 4 |
| 1 wk | 168 ± 18 | 127 ± 27 |
| 2 wk | 265 ± 30 | 247 ± 36 |
| 3 wk | 367 ± 53 | 349 ± 77 |
| 4 wk | 630 ± 91 | 516 ± 125 |
| 5 wk | 913 ± 94 | 792 ± 154 |
| 6 wk | 1201 ± 109 | 998 ± 161 |
| 7 wk | 1468 ± 135 | 1263 ± 169 |
| 8 wk | 1723 ± 146 | 1512 ± 179 |
| 9 wk | 2013 ± 191 | 1701 ± 210 |
| 10 wk | 2276 ± 176 | 1974 ± 226 |
| 11 wk | 2231 ± 220 → see note | 2231 ± 220 |
| 12 wk | 2798 ± 253 | 2353 ± 260 |

> Note: week 11 battery value is 2576 ± 235. Corrected in the machine-readable
> copy at `ai_training/reference/palka_2018_table1.csv`.

### 3.2 Key findings used

1. **Breed was not significant** for body weight at any age from week 1 to 12.
   The only breed differences were at birth and week 1, which the authors
   attribute to litter size, not to intrinsic kit growth.
2. **Housing system was significant from week 6 to week 12.** Battery-reared
   rabbits reached a final weight 445 g higher than box-reared rabbits.
3. The authors attribute the gap to social hierarchy limiting feed access in
   group boxes, and to greater physical activity causing energy loss.

### 3.3 Limitations

- Two European meat breeds only. Not pet or dwarf breeds.
- Terminates at 12 weeks; does not cover adult growth.
- Weeks 0–1 report litter weight divided by kit count, not individual weights.

---

## 4. Secondary source — within-breed environmental range

**Bielański, P. & Pankowski, P. (2017).** Effect of housing conditions and
feeding system on slaughter performance parameters of Popielno White rabbits.
*Scientific Annals of the Polish Society of Animal Production*, 13(2), 9–23.

- **Access:** Open access. National Research Institute of Animal Production, Balice.
- **Animals:** 261 young Popielno White rabbits, four treatment groups.
- **Funding:** NCBR project No. 12 0083 10.

### 4.1 Extracted reference table (Tables 3 and 4)

Body weight in grams, mean ± SEM. **SEM, not SD** — see 4.3.

| Age (days) | Pellets, indoor (n=55) | Pellets, outdoor (n=63) | Farm feed, indoor (n=75) | Farm feed, outdoor (n=68) |
|---|---|---|---|---|
| 35 | 511.2 ± 12.60 | 474.1 ± 13.37 | 398.2 ± 13.80 | 421.2 ± 17.08 |
| 56 | 1348.7 ± 36.66 | 1237.3 ± 42.58 | 944.0 ± 32.60 | 862.0 ± 42.23 |
| 70 | 1878.5 ± 38.72 | 1764.1 ± 42.77 | 1350.2 ± 49.21 | 1191.2 ± 43.80 |
| 77 | 2608.9 ± 46.46 | 2067.8 ± 38.12 | 1557.4 ± 42.65 | 1454.4 ± 39.32 |
| 90 | 2992.4 ± 51.64 | 2365.6 ± 43.32 | 1872.2 ± 53.53 | 1785.2 ± 44.83 |

### 4.2 Key finding used

At 90 days, a **single breed** ranged from 1,872 g to 2,992 g depending only on
diet and housing — a factor of 1.60. Rabbits on farm feed needed 120–130 days
to reach the 2,500 g that pellet-fed rabbits reached before day 90.

This is the central justification for the deviation-tracking design: a
population reference curve cannot predict an individual pet rabbit's weight,
because husbandry accounts for more variation than genetics does.

### 4.3 Required conversion

Values are reported as SEM. Convert before use:

```
SD = SEM * sqrt(n)
```

Worked example — day 90, pellets indoor: `51.64 * sqrt(55) = 383 g`.

---

## 5. Birth weight source

**Pycha, J., Zatoń-Dobrowolska, M., Pałka, S. & Kmiecik, M. (2020).** The
influence of maternal and paternal components and breeding season on the
reproductive results of New Zealand White and Californian female rabbits.
*Scientific Annals of the Polish Society of Animal Production*, 16(1), 37–49.
DOI: 10.5604/01.3001.0014.0503

- **Access:** Open access.
- **Animals:** 67 does (55 NZW, 12 Californian), 118 litters.
- **Analysis:** R; Shapiro-Wilk, Bartlett, ANOVA / Kruskal-Wallis, Tukey HSD.

### 5.1 Extracted values

Mean litter birth weight per kit, grams:

| Group | Mean ± SD |
|---|---|
| New Zealand White does | 66.54 ± 14.58 |
| Californian does | 61.66 ± 11.76 |

By cross (all does), range 55.05 g (BUR×CAL) to 69.81 g (FG×NZW).

### 5.2 Cross-validation

Pałka et al. (2018) report birth weights of 61–72 g. Pycha et al. report
55–71 g. The ranges overlap substantially across different farms, breeds and
years. The generator's birth weight distribution is set from this consensus.

### 5.3 Additional finding used

Repeatability of litter size at weaning was **0.15**, versus 0.36 for total
litter size. The authors conclude that rearing outcomes are strongly
environmentally determined rather than genetic — consistent with Section 4.

---

## 6. Derived parameter: the noise model

Coefficient of variation computed from Section 3.1 (SD / mean):

| Age | Battery CV | Box CV |
|---|---|---|
| Birth | 11.3% | 6.6% |
| 3 wk | 14.4% | 22.1% |
| 4 wk | 14.4% | 24.2% |
| 8 wk | 8.5% | 11.8% |
| 12 wk | 9.0% | 11.0% |

Independent check against Section 4, day 90 (after SEM→SD conversion):
pellets indoor 12.8%, pellets outdoor 14.5%.

**Conclusions carried into the generator:**

1. CV is approximately 10–15% across the growth period. Two independent
   studies, different breeds and farms, converge on this figure.
2. **Variance scales with the mean.** Noise is modelled multiplicatively.
   Constant-variance (homoscedastic) noise would misrepresent the data.
3. CV peaks at weeks 3–5, coinciding with the weaning transition. The
   generator applies an elevated variance term across this window.

---

## 7. Response to the synthetic-data criticism

The criticism raised against the illness module was that a model trained on
generated data cannot claim clinical validity. The growth module is
architected so that this criticism does not apply:

- The **reference curve** is not learned from generated data. It is a Gompertz
  function fitted to the published means in Sections 3 and 4. The fit is
  reported with residuals against those published values, and can be
  reproduced by anyone with the tables above.
- The **personal model** is fitted at runtime to weights the owner recorded on
  their own scale. It has no training set at all.
- Generated data is used only for pipeline testing and demo seeding. It is
  never presented to a user as a prediction about a real animal.

---

## 8. Known gaps and stated limitations

These must appear in the dissertation limitations section. They are not
concealed.

1. **Breed coverage.** All sources cover European commercial meat breeds
   (Popielno White, Blanc de Termonde, New Zealand White, Californian). No
   peer-reviewed growth curves were located for Lionhead, Angora, or
   Himalayan. Dutch appears only in crossbreeding studies.
2. **Dwarf breeds cannot be obtained by rescaling.** A Netherland Dwarf adult
   weighs ~1.1 kg; the source animals reach 2.3–3.0 kg by week 12. There is no
   evidence that the maturation rate parameter transfers across that range.
   The application does not offer a reference curve for dwarf breeds.
3. **Age ceiling.** All three sources stop at 84–90 days. Growth beyond week 12
   is not covered and is flagged in the UI as outside the reference range.
4. **Production context.** These animals were reared for meat under controlled
   husbandry. Pet rabbits are typically neutered, kept in different conditions,
   and not selected for growth rate. The reference curve is presented to users
   as a general guide, never as a target.
5. **Sex.** Both Pałka et al. and Bielański & Pankowski report no significant
   sex difference before ~120 days, so sex is not a model feature. This is a
   documented decision, not an omission.

---

## 9. Sources consulted but not used as parameters

- **Blasco, A., Piles, M. & Varona, L. (2003).** A Bayesian analysis of the
  effect of selection for growth rate on growth curves in rabbits. *Genetics
  Selection Evolution*, 35, 21. — Required for growth beyond week 12; covers
  birth to 40 weeks with posterior distributions of Gompertz parameters.
- **Setiaji, A., Sutopo, S. & Kurnianto, E. (2013).** Growth analysis in rabbit
  using Gompertz non-linear model. *JITAA*, 38(2), 92–97.
  DOI: 10.14710/jitaa.38.2.92-97. — Rex breed, tropical conditions. Note: the
  reported R² of 0.999 is fitted to sex-averaged means, not individual animals,
  and therefore overstates predictive accuracy for a single rabbit.
- **Lebas, F., Coudert, P., de Rochambeau, H. & Thébault, R.G. (1997).** The
  Rabbit: Husbandry, Health and Production. FAO Animal Production and Health
  Series No. 21. — Husbandry context and normal weight ranges.

---

## 10. Machine-readable copies

Tables transcribed to CSV for direct loading:

```
ai_training/reference/palka_2018_table1.csv
ai_training/reference/bielanski_2017_growth.csv
ai_training/reference/pycha_2020_birthweight.csv
```

Each CSV carries a header comment giving the source citation and the table
number it was transcribed from.
