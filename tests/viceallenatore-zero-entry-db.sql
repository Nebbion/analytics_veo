set role authenticated;
set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
-- A draft requires only an existing match; model, video and match plan are optional.
insert into public.tactical_analysis_drafts(match_id,input_sha256,input_snapshot,items,created_by)
values('M1',repeat('f',64),'{}','[{"key":"conflict:first_goal","evidence_key":"SOURCE:12:13","type":"osservazione","text":"12 / 13"}]',auth.uid());
insert into public.tactical_analysis_reviews(draft_id,item_key,evidence_key,verdict,corrected_text,created_by)
select id,'conflict:first_goal','SOURCE:12:13','corrected','13 dopo verifica',auth.uid() from public.tactical_analysis_drafts where input_sha256=repeat('f',64);
do $$ begin
  begin
    insert into public.tactical_analysis_reviews(draft_id,item_key,evidence_key,verdict,created_by)
    select id,'not_in_draft','SOURCE:12:13','accepted',auth.uid() from public.tactical_analysis_drafts limit 1;
    raise exception 'fabricated item accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.tactical_analysis_reviews(draft_id,item_key,evidence_key,verdict,created_by)
    select id,'conflict:first_goal','SOURCE:12:13','corrected',auth.uid() from public.tactical_analysis_drafts where input_sha256=repeat('f',64);
    raise exception 'empty correction accepted';
  exception when check_violation then null; end;
  begin
    update public.tactical_analysis_drafts set items='[]';
    raise exception 'draft overwrite accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.tactical_analysis_reviews set corrected_text='overwritten';
    raise exception 'review overwrite accepted';
  exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
do $$ begin
  if exists(select 1 from public.tactical_analysis_drafts) then raise exception 'player reads draft'; end if;
  if exists(select 1 from public.tactical_analysis_reviews) then raise exception 'player reads reviews'; end if;
  begin
    insert into public.tactical_analysis_drafts(match_id,input_sha256,input_snapshot,items,created_by) values('M1',repeat('0',64),'{}','[]',auth.uid());
    raise exception 'player creates draft';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform count(*) from public.tactical_analysis_drafts; raise exception 'anon reads draft';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
do $$ declare model_key uuid; begin
  insert into public.tactical_models(season_label,title,created_by) values('2026/27','Stagionale test',auth.uid()) returning id into model_key;
  insert into public.tactical_season_settings(season_label,model_id,updated_by) values('2026/2027',model_key,auth.uid());
  begin
    insert into public.tactical_season_settings(season_label,model_id,updated_by) values('2025/2026',model_key,auth.uid());
    raise exception 'cross-season setting accepted';
  exception when foreign_key_violation then null; end;
  if (select count(*) from public.tactical_analysis_reviews)<>1 then raise exception 'review missing after reload'; end if;
  if not exists(select 1 from public.analysis_audit_log where entity_type='tactical_analysis_reviews') then raise exception 'review audit missing'; end if;
end $$;
reset role;
