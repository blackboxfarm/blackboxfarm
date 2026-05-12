-- Update the 'large' template to include ?token={ca} for the holders link
UPDATE holders_intel_templates
SET template_text = replace(
  template_text,
  'FULL Holder Intel👇 https://blackbox.farm/holders',
  'FULL Holder Intel👇 https://blackbox.farm/holders?token={ca}'
)
WHERE template_name = 'large';

-- Also update the 'shares' template if it has a plain holders link
UPDATE holders_intel_templates
SET template_text = replace(
  template_text,
  'More Holder Intel👇 https://blackbox.farm/holders?v=holders5',
  'More Holder Intel👇 https://blackbox.farm/holders?token={ca}'
)
WHERE template_name = 'shares';