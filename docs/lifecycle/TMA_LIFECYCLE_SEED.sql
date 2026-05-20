-- ===========================================================================
-- TMA LIFECYCLE ARCHITECTURE v1 — SEED DATA
-- Run AFTER drizzle-kit push has created the new tables.
-- Order: rules first (so a lead arriving during seed doesn't get unsegmented),
-- then templates.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. INTAKE TRIGGER RULES (priority desc — first match wins)
-- ---------------------------------------------------------------------------

-- Booked trial (highest priority — if they picked a date, send confirmation regardless of tags)
INSERT INTO sequenceTriggerRules (priority, ruleName, matchField, matchOperator, matchValue, sequenceKey, isActive, description, createdBy)
VALUES (1000, 'Booked trial → confirmation sequence', 'hasTrialDate', 'is_true', NULL, 'booked_trial_confirmation', 1,
        'Lead picked a trialClassDate. Send the booking confirmation email immediately. No nurture follow-ups.', 'seed');

-- Summer camp (FB lead form tagged with summer_camp_*)
INSERT INTO sequenceTriggerRules (priority, ruleName, matchField, matchOperator, matchValue, sequenceKey, isActive, description, createdBy)
VALUES (900, 'Summer camp interest → summer camp nurture', 'tag', 'starts_with', 'summer_camp', 'summer_camp_nurture', 1,
        'FB Lead Ads form for summer camp. Tag set by upsertFromFacebook based on campaignName.', 'seed');

-- After-school program
INSERT INTO sequenceTriggerRules (priority, ruleName, matchField, matchOperator, matchValue, sequenceKey, isActive, description, createdBy)
VALUES (800, 'Afterschool interest → afterschool nurture', 'tag', 'contains', 'afterschool', 'afterschool_nurture', 1,
        'Lead expressed interest in after-school program.', 'seed');

-- Adult Kickboxing
INSERT INTO sequenceTriggerRules (priority, ruleName, matchField, matchOperator, matchValue, sequenceKey, isActive, description, createdBy)
VALUES (700, 'Kickboxing interest → kickboxing trial nurture', 'programInterest', 'contains', 'kickboxing', 'kickboxing_trial_nurture', 1,
        'Adult kickboxing lead. Different tone — adult fitness framing, not kids martial arts.', 'seed');

-- BJJ
INSERT INTO sequenceTriggerRules (priority, ruleName, matchField, matchOperator, matchValue, sequenceKey, isActive, description, createdBy)
VALUES (600, 'BJJ interest → BJJ trial nurture', 'programInterest', 'contains', 'bjj', 'bjj_trial_nurture', 1,
        'Brazilian Jiu-Jitsu lead. Adult/teen — gi vs no-gi info included.', 'seed');

-- Generic Taekwondo trial (catches "tkd", "taekwondo", "martial arts" kids)
INSERT INTO sequenceTriggerRules (priority, ruleName, matchField, matchOperator, matchValue, sequenceKey, isActive, description, createdBy)
VALUES (500, 'TKD/martial arts interest → TKD trial nurture', 'programInterest', 'contains', 'taekwondo', 'tkd_trial_nurture', 1,
        'Default for kid-focused TKD trial leads.', 'seed');
INSERT INTO sequenceTriggerRules (priority, ruleName, matchField, matchOperator, matchValue, sequenceKey, isActive, description, createdBy)
VALUES (499, 'Generic martial arts → TKD trial nurture', 'programInterest', 'contains', 'martial arts', 'tkd_trial_nurture', 1,
        'Catch "martial arts" variants. Falls back to TKD nurture.', 'seed');

-- Facebook lead with no specific campaign (FB generic)
INSERT INTO sequenceTriggerRules (priority, ruleName, matchField, matchOperator, matchValue, sequenceKey, isActive, description, createdBy)
VALUES (300, 'Generic FB lead → FB generic nurture', 'tag', 'equals', 'facebook_lead', 'fb_generic_nurture', 1,
        'Fallback for FB Lead Ad submissions that didn''t match a specific campaign rule above.', 'seed');

-- Web form fallback (catches anyone who reached the regular trial form)
INSERT INTO sequenceTriggerRules (priority, ruleName, matchField, matchOperator, matchValue, sequenceKey, isActive, description, createdBy)
VALUES (100, 'Web form fallback → web form nurture', 'utmSource', 'equals', 'website', 'web_form_nurture', 1,
        'Lowest-priority general fallback for anyone who submitted the website trial form without booking.', 'seed');

-- Note: if NO rule matches, the router returns sequenceKey='unsegmented'
-- and the intake workflow alerts staff instead of auto-sending anything.

-- ---------------------------------------------------------------------------
-- 2. SEQUENCE TEMPLATES (one row per touch)
-- All HTML uses TMA branding (red header #c41e3a, navy footer #1a2d5a).
-- Merge fields: {{firstName}}, {{parentName}}, {{kidName}}, {{trialDate}}, {{trialTime}}
-- ---------------------------------------------------------------------------

-- == Booked trial confirmation ==
INSERT INTO sequenceTemplates (sequenceKey, touchKey, orderIndex, delayHours, channel, subject, displayName, description, bodyHtml, createdBy)
VALUES ('booked_trial_confirmation', 'booking_confirmation', 1, 0, 'email',
        'Your TMA trial is booked for {{trialDate}}, {{firstName}}',
        'Trial Booking Confirmation',
        'Sent immediately after a lead picks a trial date. NO nurture follow-ups.',
        '<!-- placeholder: replace via admin UI. Use existing branded HTML from tma_email_templates.md -->', 'seed');

-- == Summer camp nurture (3 touches) ==
INSERT INTO sequenceTemplates (sequenceKey, touchKey, orderIndex, delayHours, channel, subject, displayName, description, bodyHtml, createdBy)
VALUES ('summer_camp_nurture', 'day_0_camp_overview', 1, 0, 'email',
        '{{firstName}}, here''s everything about TMA Summer Camp',
        'Day 0 — Camp Overview',
        'Sent immediately. Camp dates, pricing, what kids do each day, field trips, extended care.',
        '<!-- placeholder: replace via admin UI -->', 'seed');

INSERT INTO sequenceTemplates (sequenceKey, touchKey, orderIndex, delayHours, channel, subject, displayName, description, bodyHtml, createdBy)
VALUES ('summer_camp_nurture', 'day_3_spots_filling', 2, 72, 'email',
        'Spots are filling fast for TMA Summer Camp',
        'Day 3 — Spots Filling',
        'Soft urgency. Mention specific weeks selling out. Include the registration link.',
        '<!-- placeholder: replace via admin UI -->', 'seed');

INSERT INTO sequenceTemplates (sequenceKey, touchKey, orderIndex, delayHours, channel, subject, displayName, description, bodyHtml, createdBy)
VALUES ('summer_camp_nurture', 'day_6_last_call', 3, 144, 'email',
        'Last call before TMA Summer Camp starts',
        'Day 6 — Last Call',
        'Final push. Mention camp start date and remaining weeks. After this touch, lead goes cold if no booking.',
        '<!-- placeholder: replace via admin UI -->', 'seed');

-- == After-school nurture (3 touches) ==
INSERT INTO sequenceTemplates (sequenceKey, touchKey, orderIndex, delayHours, channel, subject, displayName, description, bodyHtml, createdBy)
VALUES ('afterschool_nurture', 'day_0_program_overview', 1, 0, 'email',
        'TMA After-School: pickup, training, homework — handled',
        'Day 0 — Program Overview',
        'Sent immediately. Pickup zones, daily schedule, what makes TMA after-school different from generic daycare.',
        '<!-- placeholder: replace via admin UI -->', 'seed');

INSERT INTO sequenceTemplates (sequenceKey, touchKey, orderIndex, delayHours, channel, subject, displayName, description, bodyHtml, createdBy)
VALUES ('afterschool_nurture', 'day_3_schedule_pricing', 2, 72, 'email',
        '{{firstName}}, here are TMA After-School pricing and schedule details',
        'Day 3 — Schedule + Pricing',
        'Hard details — daily/weekly/monthly options, sibling discount, pickup map.',
        '<!-- placeholder: replace via admin UI -->', 'seed');

INSERT INTO sequenceTemplates (sequenceKey, touchKey, orderIndex, delayHours, channel, subject, displayName, description, bodyHtml, createdBy)
VALUES ('afterschool_nurture', 'day_7_enrollment_open', 3, 168, 'email',
        'After-school enrollment is open — reserve your spot',
        'Day 7 — Enrollment Open',
        'Call to action: book a tour OR sign up online. After this, lead goes cold.',
        '<!-- placeholder: replace via admin UI -->', 'seed');

-- == TKD trial nurture (2 touches — replaces current Day 2 / Day 4) ==
INSERT INTO sequenceTemplates (sequenceKey, touchKey, orderIndex, delayHours, channel, subject, displayName, description, bodyHtml, createdBy)
VALUES ('tkd_trial_nurture', 'day_2_still_thinking', 1, 48, 'email',
        'Still thinking about that free TKD class, {{firstName}}?',
        'Day 2 — Still Thinking',
        'Soft check-in. Mention how much kids enjoy the first class. CTA: pick a date.',
        '<!-- placeholder: replace via admin UI -->', 'seed');

INSERT INTO sequenceTemplates (sequenceKey, touchKey, orderIndex, delayHours, channel, subject, displayName, description, bodyHtml, createdBy)
VALUES ('tkd_trial_nurture', 'day_4_one_last_thing', 2, 96, 'email',
        'One last thing about your TKD trial, {{firstName}}',
        'Day 4 — One Last Thing',
        'Final touch. After this the lead goes cold automatically.',
        '<!-- placeholder: replace via admin UI -->', 'seed');

-- == Kickboxing trial nurture (2 touches — adult tone) ==
INSERT INTO sequenceTemplates (sequenceKey, touchKey, orderIndex, delayHours, channel, subject, displayName, description, bodyHtml, createdBy)
VALUES ('kickboxing_trial_nurture', 'day_2_adult_check_in', 1, 48, 'email',
        'Your TMA Kickboxing trial — quick check-in',
        'Day 2 — Adult Check-In',
        'Adult-focused. Stress relief, conditioning, no-prior-experience-needed framing.',
        '<!-- placeholder: replace via admin UI -->', 'seed');

INSERT INTO sequenceTemplates (sequenceKey, touchKey, orderIndex, delayHours, channel, subject, displayName, description, bodyHtml, createdBy)
VALUES ('kickboxing_trial_nurture', 'day_4_what_first_class_is_like', 2, 96, 'email',
        'What your first TMA Kickboxing class will actually look like',
        'Day 4 — What First Class Is Like',
        'Demystify the trial. Final touch.',
        '<!-- placeholder: replace via admin UI -->', 'seed');

-- == BJJ trial nurture (2 touches) ==
INSERT INTO sequenceTemplates (sequenceKey, touchKey, orderIndex, delayHours, channel, subject, displayName, description, bodyHtml, createdBy)
VALUES ('bjj_trial_nurture', 'day_2_bjj_intro', 1, 48, 'email',
        'Your TMA BJJ trial — what to expect',
        'Day 2 — BJJ Intro',
        'BJJ-specific. Gi vs no-gi, what to wear if no gi yet, first-timer expectations.',
        '<!-- placeholder: replace via admin UI -->', 'seed');

INSERT INTO sequenceTemplates (sequenceKey, touchKey, orderIndex, delayHours, channel, subject, displayName, description, bodyHtml, createdBy)
VALUES ('bjj_trial_nurture', 'day_4_bjj_final', 2, 96, 'email',
        'One last note about BJJ at TMA',
        'Day 4 — BJJ Final',
        'Final touch.',
        '<!-- placeholder: replace via admin UI -->', 'seed');

-- == FB generic nurture (fallback for FB leads without specific campaign tags) ==
INSERT INTO sequenceTemplates (sequenceKey, touchKey, orderIndex, delayHours, channel, subject, displayName, description, bodyHtml, createdBy)
VALUES ('fb_generic_nurture', 'day_1_thanks_for_interest', 1, 24, 'email',
        'Thanks for reaching out, {{firstName}} — here''s what TMA offers',
        'Day 1 — Thanks',
        'Generic welcome for FB lead with no campaign-specific match. Mentions all major programs.',
        '<!-- placeholder: replace via admin UI -->', 'seed');

INSERT INTO sequenceTemplates (sequenceKey, touchKey, orderIndex, delayHours, channel, subject, displayName, description, bodyHtml, createdBy)
VALUES ('fb_generic_nurture', 'day_4_pick_a_program', 2, 96, 'email',
        '{{firstName}}, which TMA program is right for you?',
        'Day 4 — Pick a Program',
        'Direct ask: TKD, kickboxing, BJJ, or after-school? Helps re-tag the lead.',
        '<!-- placeholder: replace via admin UI -->', 'seed');

-- == Web form nurture (default fallback) ==
INSERT INTO sequenceTemplates (sequenceKey, touchKey, orderIndex, delayHours, channel, subject, displayName, description, bodyHtml, createdBy)
VALUES ('web_form_nurture', 'day_2_default_followup', 1, 48, 'email',
        'Following up on your TMA inquiry',
        'Day 2 — Default Follow-Up',
        'Most generic. Used only when no other rule matched.',
        '<!-- placeholder: replace via admin UI -->', 'seed');

INSERT INTO sequenceTemplates (sequenceKey, touchKey, orderIndex, delayHours, channel, subject, displayName, description, bodyHtml, createdBy)
VALUES ('web_form_nurture', 'day_4_default_final', 2, 96, 'email',
        'Last note from TMA, {{firstName}}',
        'Day 4 — Default Final',
        'Final touch. Generic.',
        '<!-- placeholder: replace via admin UI -->', 'seed');

-- == Unsegmented (NEVER auto-sends — only alerts staff) ==
-- We DELIBERATELY do not seed any templates for sequenceKey='unsegmented'.
-- preSendGuard will return template_not_found, which is correct behavior.
-- The intake router should generate a staff alert when this sequenceKey is returned.

-- ---------------------------------------------------------------------------
-- 3. AUDIT LOG SEED — mark the migration
-- ---------------------------------------------------------------------------
INSERT INTO systemAuditLog (level, source, event, details)
VALUES ('info', 'migration', 'lifecycle_v1_seed_applied',
        '{"version":"v1","timestamp":"2026-05-20","rules_created":9,"templates_created":17,"note":"Initial seed of intake routing rules and sequence templates. Templates contain placeholder HTML — admin must populate via /admin/sequences UI."}');
