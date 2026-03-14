-- Add help_url column to channel_registry
ALTER TABLE public.channel_registry ADD COLUMN IF NOT EXISTS help_url text DEFAULT NULL;

-- Update each channel with its specific credential help URL
UPDATE public.channel_registry SET help_url = 'https://t.me/BotFather' WHERE id = 'telegram';
UPDATE public.channel_registry SET help_url = 'https://business.facebook.com/settings/whatsapp-business-accounts' WHERE id = 'whatsapp';
UPDATE public.channel_registry SET help_url = 'https://developers.facebook.com/apps/' WHERE id = 'facebook_page';
UPDATE public.channel_registry SET help_url = 'https://developers.facebook.com/apps/' WHERE id = 'messenger';
UPDATE public.channel_registry SET help_url = 'https://developers.facebook.com/apps/' WHERE id = 'instagram_dm';
UPDATE public.channel_registry SET help_url = 'https://www.linkedin.com/developers/apps' WHERE id = 'linkedin';
UPDATE public.channel_registry SET help_url = 'https://developers.tiktok.com/' WHERE id = 'tiktok';
UPDATE public.channel_registry SET help_url = 'https://console.cloud.google.com/apis/library/youtube.googleapis.com' WHERE id = 'youtube';
UPDATE public.channel_registry SET help_url = 'https://console.cloud.google.com/apis/library/mybusinessbusinessinformation.googleapis.com' WHERE id = 'google_business';
UPDATE public.channel_registry SET help_url = 'https://www.twilio.com/console' WHERE id = 'twilio_sms';
UPDATE public.channel_registry SET help_url = 'https://www.twilio.com/console' WHERE id = 'twilio_voice';
UPDATE public.channel_registry SET help_url = 'https://discord.com/developers/applications' WHERE id = 'discord';
UPDATE public.channel_registry SET help_url = 'https://www.reddit.com/prefs/apps' WHERE id = 'reddit';