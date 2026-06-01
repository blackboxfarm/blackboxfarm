UPDATE public.holders_intel_templates
SET template_text = E'🛰 *INTEL UPDATE* — {ticker}\nEntry {mcEntry} → Now {mc} ({multiplier})\nHealth: {healthGrade}\nTop holders: {top10}\nLP: {lp}\n`{ca}`'
WHERE template_name = 'no_lube_intel_update_private';