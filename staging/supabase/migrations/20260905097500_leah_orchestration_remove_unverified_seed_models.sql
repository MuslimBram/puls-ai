-- Keep only the model already certified by the current LEAH UI.
-- Other provider/model entries must be explicitly configured from verified provider data.
delete from public.leah_ai_model_catalog
where not (provider='openai' and model='gpt-4o-mini');
