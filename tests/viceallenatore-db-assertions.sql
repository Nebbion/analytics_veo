-- Run after the fixture and migration against an isolated PostgreSQL 17 DB.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.tactical_models(season_label,title,created_by) values ('2026/27','Test',auth.uid());
insert into public.analysis_sources(match_id,provider,kind,filename,sha256,imported_by)
values ('M1','staff','annotation','test','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',auth.uid());
do $$ begin
  if (select count(*) from public.tactical_models) <> 1 then raise exception 'staff cannot read model'; end if;
end $$;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  if (select count(*) from public.tactical_models) <> 0 then raise exception 'player can read staff models'; end if;
  if (select count(*) from public.analysis_sources) <> 0 then raise exception 'player can read staff sources'; end if;
end $$;
do $$ begin
  begin
    insert into public.tactical_models(season_label,title,created_by) values ('2026/27','Unauthorized',auth.uid());
    raise exception 'player insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='match_tactical_events_match_id_fkey') then raise exception 'match FK missing'; end if;
  if not exists (select 1 from pg_constraint where conname='match_tactical_events_player_id_fkey') then raise exception 'player FK missing'; end if;
  if not exists (select 1 from pg_policies where tablename='analysis_sources' and policyname='va_staff_select') then raise exception 'source RLS missing'; end if;
end $$;
set role anon;
do $$ begin
  begin
    perform count(*) from public.analysis_sources;
    raise exception 'anonymous select unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$ declare plan_id uuid; version_id uuid; principle_id uuid; video_id uuid; pdf_id uuid; clip_id uuid; finding_id uuid; intervention_id uuid; v_briefing_id uuid; model_id uuid; model_version_id uuid; v_event_id uuid; v_assessment_id uuid; begin
  select id into model_id from public.tactical_models limit 1;
  insert into public.tactical_model_versions(model_id,version,status,snapshot,snapshot_sha256,created_by,approved_by,approved_at)
  values (model_id,1,'approved','{"principles":[{"title":"Test"}]}'::jsonb,repeat('a',64),auth.uid(),auth.uid(),now()) returning id into model_version_id;
  insert into public.analysis_sources(match_id,provider,kind,filename,sha256,review_status,imported_by)
  values ('M1','staff','pdf','plan.pdf',repeat('d',64),'reviewed',auth.uid()) returning id into pdf_id;
  insert into public.match_game_plans(match_id,model_version_id,created_by) values ('M1',model_version_id,auth.uid()) returning id into plan_id;
  insert into public.game_plan_versions(plan_id,model_version_id,version,pdf_source_id,created_by) values (plan_id,model_version_id,1,pdf_id,auth.uid()) returning id into version_id;
  insert into public.tactical_principles(game_plan_version_id,title,phase,expected_behavior) values (version_id,'Principio test','pressing','Comportamento test') returning id into principle_id;
  update public.game_plan_versions set status='approved',snapshot_sha256=repeat('b',64),approved_by=auth.uid(),approved_at=now() where id=version_id;
  insert into public.match_tactical_events(match_id,event_type,description,source_id,observability,relevance,created_by)
  values ('M1','other','Fatto verificato',(select id from public.analysis_sources where kind='annotation' limit 1),'observable','relevant',auth.uid()) returning id into v_event_id;
  insert into public.event_assessments(event_id,principle_id,game_plan_version_id,plan_compliance,technical_quality,reason,observability,relevance,review_status,reviewed_by,reviewed_at)
  values (v_event_id,principle_id,version_id,'conforme','positiva','Valutazione test','observable','relevant','reviewed',auth.uid(),now()) returning id into v_assessment_id;
  begin
    update public.match_tactical_events set description='Mutato' where id=v_event_id;
    raise exception 'reviewed event unexpectedly mutable';
  exception when integrity_constraint_violation then null;
  end;
  begin
    update public.event_assessments set reason='Mutato' where id=v_assessment_id;
    raise exception 'reviewed assessment unexpectedly mutable';
  exception when integrity_constraint_violation then null;
  end;
  begin
    update public.analysis_sources set filename='mutato' where kind='annotation';
    raise exception 'source identity unexpectedly mutable';
  exception when integrity_constraint_violation then null;
  end;
  begin
    update public.tactical_principles set title='Mutato' where id=principle_id;
    raise exception 'approved principle unexpectedly mutable';
  exception when integrity_constraint_violation then null;
  end;
  begin
    update public.game_plan_versions set snapshot_sha256='mutato' where id=version_id;
    raise exception 'approved version unexpectedly mutable';
  exception when integrity_constraint_violation then null;
  end;
  begin
    insert into public.match_tactical_events(match_id,event_type,description,video_start_ms,video_end_ms,created_by)
    values ('M1','other','Intervallo invalido',2000,1000,auth.uid());
    raise exception 'inverted interval unexpectedly accepted';
  exception when check_violation then null;
  end;
  insert into public.analysis_sources(match_id,provider,kind,filename,sha256,imported_by)
  values ('M1','veo','video','video.mp4','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',auth.uid()) returning id into video_id;
  insert into public.video_clock_segments(match_id,source_id,video_start_ms,video_end_ms,period,game_start_minute,notes,verified_by)
  values ('M1',video_id,0,60000,'first_half',0,'Test manuale',auth.uid());
  begin
    insert into public.video_clock_segments(match_id,source_id,video_start_ms,video_end_ms,period,game_start_minute,notes,verified_by)
    values ('M1',(select id from public.analysis_sources where kind='annotation' limit 1),0,60000,'first_half',0,'Fonte non video',auth.uid());
    raise exception 'non-video clock source unexpectedly accepted';
  exception when foreign_key_violation then null;
  end;
  insert into public.tactical_findings(match_id,scope,title,created_by) values ('M1','weakness','Test',auth.uid()) returning id into finding_id;
  begin
    update public.tactical_findings set status='confermato' where id=finding_id;
    raise exception 'finding without evidence unexpectedly confirmed';
  exception when integrity_constraint_violation then null;
  end;
  insert into public.analysis_sources(match_id,provider,kind,filename,sha256,review_status,imported_by)
  values ('M1','veo','clip','verified-clip.mp4',repeat('e',64),'reviewed',auth.uid()) returning id into clip_id;
  insert into public.event_evidence(event_id,source_id,stance,start_ms,end_ms)
  values (v_event_id,clip_id,'supports',0,1000);
  insert into public.finding_evidence(finding_id,event_id,stance)
  values (finding_id,v_event_id,'supports');
  update public.tactical_findings set status='confermato',observed_opportunities=1,violations=1 where id=finding_id;
  insert into public.training_interventions(finding_id,observable_objective,exercise,created_by)
  values (finding_id,'Obiettivo test','Esercizio test',auth.uid()) returning id into intervention_id;
  insert into public.followup_checks(finding_id,intervention_id,target_match_id,created_by)
  values (finding_id,intervention_id,'M2',auth.uid());
  if (select count(*) from public.followup_checks) <> 1 then raise exception 'follow-up link missing'; end if;
  insert into public.decision_briefings(match_id,created_by) values ('M1',auth.uid()) returning id into v_briefing_id;
  insert into public.briefing_items(briefing_id,position,decision_text,rationale,supporting_evidence,confidence_reason,next_match_check)
  values (v_briefing_id,1,'Decisione test','Motivo','Evento test','Bassa','Prossima partita');
  update public.decision_briefings set status='approved',approved_by=auth.uid(),approved_at=now() where id=v_briefing_id;
  begin
    update public.briefing_items set decision_text='Mutata' where briefing_id=v_briefing_id;
    raise exception 'approved briefing item unexpectedly mutable';
  exception when integrity_constraint_violation then null;
  end;
  begin
    insert into public.analysis_sources(match_id,provider,kind,filename,sha256,imported_by)
    values ('M2','staff','annotation','other','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',auth.uid());
    begin
      insert into public.match_tactical_events(match_id,event_type,description,source_id,created_by)
      values ('M1','other','Fonte di altra partita',
              (select id from public.analysis_sources where match_id='M2' limit 1),auth.uid());
      raise exception 'cross-match source unexpectedly accepted';
    exception when foreign_key_violation then null;
    end;
  end;
  if (select count(*) from public.analysis_audit_log) < 4 then raise exception 'audit trigger missing'; end if;
end $$;
reset role;
