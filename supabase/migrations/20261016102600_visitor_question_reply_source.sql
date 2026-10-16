alter table public.visitor_questions
  add column reply_source text
  check (reply_source in ('gemini', 'telegram', 'local'));

comment on column public.visitor_questions.reply_source is
  'Response path for new tickets only: gemini, telegram, or local privacy response; NULL means not recorded (including historical rows).';
