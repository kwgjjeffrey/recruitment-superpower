import {metricReport} from '@recruitment/page/viz/metrics';
const metrics=[
 {key:'new_application',label:'New Application',group:'Application',description:'Applications created in the selected period, or the selected creation cohort.'},
 {key:'evaluation_arranged',label:'Evaluation Arranged',group:'Evaluation',description:'At least one evaluation request was created. Multiple reviewers count once; subsequent withdrawal does not erase the arrangement.'},
 {key:'evaluation_passed',label:'Evaluation Passed',group:'Evaluation',description:'At least one current evaluation result is Yes. This is a positive recommendation, not a final application decision. Time is result submission time; edits restate the report.'},
 {key:'test_arranged',label:'Test Arranged',group:'Test',description:'At least one Test record was created; this does not establish that an invitation was sent.'},
 {key:'test_completed',label:'Test Completed',group:'Test',description:'At least one Test is Passed or Failed. Uses completion-recorded time; unknown historical times remain unknown.'},
 ...[1,2,3,4,5].flatMap(n=>[
  {key:`interview_${n}_completed`,label:`Interview Round ${n===5?'5+':n} Completed`,group:`Interview ${n===5?'5+':n}`,description:`${n===5?'At least one completed interview numbered 5 or above.':'The '+n+'th completed interview.'} Numbers use the full completed interview history before date filtering. Each Application counts once.`},
  {key:`interview_${n}_passed`,label:`Interview Round ${n===5?'5+':n} Passed`,group:`Interview ${n===5?'5+':n}`,description:`${n===5?'At least one interview numbered 5 or above has':'Interview '+n+' has'} a current Yes or Strong yes recommendation. Mixed and No are not passed. Each Application counts once.`},
 ]),
];
export const report=metricReport({
 description:'Application funnel based on recorded activities. Activity time counts the period’s events; cohort mode follows Applications created in the period. Counts are distinct Applications, not activity counts. Rounds mean completed interview occurrences, not management stages. Optional steps and direct results mean counts need not decrease monotonically. Current Job/owner attribution; result corrections restate historical reporting. Every count opens its exact qualifying Applications and activities.',
 entityLabel:'Applications',unknownTimeMetric:'test_completed',metrics,
 dimensions:[{key:'job',column:'job_id',labelColumn:'job_label',label:'Job'},{key:'owner',column:'owner_id',labelColumn:'owner_name',label:'Job owner'}],
 data_source:{kind:'sql',sql:`SELECT application_id AS entity_id,talent_name AS entity_name,application_url AS entity_url,
 application_created_at AS cohort_at,event_at,metric_key AS metric,activity_id AS event_id,
 activity_label AS event_label,result,interview_number AS sequence,job_id,
 concat_ws(' · ',job_title,owner_name) AS job_label,owner_id,owner_name
 FROM "recruitment/tables/application_funnel_events"`,
 verified_columns:{entity_id:'string',entity_name:'string',entity_url:'string',cohort_at:'timestamp',event_at:'timestamp',metric:'string',event_id:'string',event_label:'string',result:'string',sequence:'integer',job_id:'string',job_label:'string',owner_id:'string',owner_name:'string'}},
});
