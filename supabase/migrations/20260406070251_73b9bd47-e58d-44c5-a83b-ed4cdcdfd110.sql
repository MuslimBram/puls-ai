
ALTER TABLE public.channel_registry ADD COLUMN IF NOT EXISTS account_type_label text DEFAULT 'Profile';

UPDATE public.channel_registry SET account_type_label = 'Business, Creator, or Personal' WHERE id = 'instagram';
UPDATE public.channel_registry SET account_type_label = 'Page or Group' WHERE id = 'facebook';
UPDATE public.channel_registry SET account_type_label = 'Page or Profile' WHERE id = 'linkedin';
UPDATE public.channel_registry SET account_type_label = 'Business or Creator' WHERE id = 'tiktok';
UPDATE public.channel_registry SET account_type_label = 'Channel' WHERE id = 'youtube';
UPDATE public.channel_registry SET account_type_label = 'Profile' WHERE id = 'twitter';
UPDATE public.channel_registry SET account_type_label = 'Bot' WHERE id = 'telegram';
UPDATE public.channel_registry SET account_type_label = 'Business Account' WHERE id = 'whatsapp';
UPDATE public.channel_registry SET account_type_label = 'SMTP / Provider' WHERE id = 'email';
UPDATE public.channel_registry SET account_type_label = 'Custom Integration' WHERE id = 'custom';
