import {block,f,viz} from '@recruitment/page/viz';
export const periods={last_30d:'Last 30 days',last_90d:'Last 90 days',ytd:'Year to date'};
export const statuses={'':'All applications',active:'Active',archived:'Archived'};
const period=f.dateRange('Application creation date, using UTC day boundaries.',{rel_column:'created_at',default:'last_90d'});
period.enum=Object.keys(periods);
period.title='Created within';period.labels=periods;
const department={...f.string('Department contains this text.',{default:'',rel_column:'department',title:'Department'}),maxLength:120};
export const report=viz({
  description:'Recruiting activity by application creation date and current stage. Each application is counted once; this is a current-stage snapshot, not a historical conversion funnel.',
  data_source:{kind:'sql',
    sql:`SELECT a.id, a.created_at, a.stage, a.status,
  COALESCE(NULLIF(j.department, ''), 'Unassigned') AS department,
  j.title AS job_title,
  CASE WHEN a.status = 'active' THEN a.id ELSE NULL END AS active_id,
  CASE WHEN a.stage = 'interview' THEN a.id ELSE NULL END AS interview_id,
  CASE WHEN a.stage = 'hired' THEN a.id ELSE NULL END AS hired_id
FROM "recruitment/tables/applications" a
JOIN "recruitment/tables/jobs" j ON a.job_id = j.id`,
    verified_columns:{id:'string',created_at:'timestamp',stage:'string',status:'string',department:'string',job_title:'string',active_id:'string',interview_id:'string',hired_id:'string'},
  },
  params:{period,status:f.select('Application status.',{fixed:Object.keys(statuses),default:'',rel_column:'status',title:'Application status',labels:statuses}),department},
  blocks: [
    block.stat({
      id: 'total', title: 'Applications',
      value: { agg: 'count', as: 'applications', label: 'Applications', format: 'int' },
    }),
    block.stat({
      id: 'active', title: 'Active applications',
      value: { agg: 'count_distinct', rel_column: 'active_id', label: 'Active applications', format: 'int' },
    }),
    block.stat({
      id: 'interview', title: 'At interview',
      value: { agg: 'count_distinct', rel_column: 'interview_id', label: 'At interview', format: 'int' },
    }),
    block.stat({
      id: 'hired', title: 'Hired',
      value: { agg: 'count_distinct', rel_column: 'hired_id', label: 'Hired', format: 'int' },
    }),
    block.area({
      id: 'trend', title: 'Application activity', span: 2, stacked: true,
      x: { rel_column: 'created_at', grain: 'week', fill: 'zero', label: 'Week' },
      y: { agg: 'count', as: 'applications', label: 'Applications', format: 'int' },
      series: { rel_column: 'status', label: 'Status', labels: { active: 'Active', archived: 'Archived' } },
    }),
    block.pie({
      id: 'stages', title: 'Current stage', span: 2, donut: true,
      category: {
        rel_column: 'stage', label: 'Stage', sort: 'value_desc',
        labels: { screening: 'Screening', assessment: 'Assessment', interview: 'Interview', offer: 'Offer', hired: 'Hired' },
      },
      value: { agg: 'count', as: 'applications', label: 'Applications', format: 'int' },
    }),
    block.bar({
      id: 'departments', title: 'Applications by department', span: 2, horizontal: true, limit: 8,
      x: { rel_column: 'department', label: 'Department', sort: 'value_desc' },
      y: { agg: 'count', as: 'applications', label: 'Applications', format: 'int' },
    }),
    block.table({
      id: 'jobs', title: 'Jobs by application volume', span: 2, limit: 10,
      columns: [
        { rel_column: 'job_title', label: 'Job', sort: 'value_desc' },
        { rel_column: 'department', label: 'Department' },
        { agg: 'count', as: 'applications', label: 'Applications', format: 'int' },
      ],
    }),
  ],
});
