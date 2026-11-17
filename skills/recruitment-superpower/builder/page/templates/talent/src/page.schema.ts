import type {PageSchema,Params,Value} from './sdk/schema';
import {object} from './sdk/portable';

// One declaration for controls, validation, table columns, TypeScript and Agent semantics.
export const page={
  asset_path:'user-page',display_name:'Talent Explorer',
  description:'Find candidates using the Talent API from an independently published MF page.',
  default_view:'main',screen:'user-page',
  invocation:{kind:'page',target:'recruitment',route:'/mf/user-page',handler:'mf-page'},
  views:{main:{
    description:'Search Talent and read the actual API result.',
    params:object('Talent search.',{
      q:{type:'string',description:'Search candidate names, companies and resume text.',default:'',maxLength:120,
        ui:{label:'Search candidates',widget:'search',placeholder:'Name, company or resume keyword'}},
      availability:{type:'string',description:'Filter by current candidate availability; empty means any status.',enum:['','open','in_conversation','unavailable'],default:'',ui:{label:'Availability',widget:'select',labels:{'':'Any availability',open:'Open to opportunities',in_conversation:'In conversation',unavailable:'Unavailable'}}},
      minExperience:{type:'integer',description:'Minimum years of professional experience; zero includes all candidates.',default:0,minimum:0,maximum:60,ui:{label:'Minimum experience (years)'}},
      page:{type:'integer',description:'One-based result page.',default:1,minimum:1,maximum:10000,ui:{label:'Page',widget:'hidden'}},
    }),
    resetOnChange:['page'],
    returns:object('Loaded Talent search result.',{
      total:{type:'integer',minimum:0,description:'Matching candidates.',ui:{label:'Matches'}},
      page:{type:'integer',minimum:1,description:'Current result page.',ui:{label:'Page'}},
      pageSize:{type:'integer',minimum:1,description:'Maximum candidates per page.',ui:{label:'Page size'}},
      items:{type:'array',description:'Visible candidates.',items:object('Candidate.',{
        id:{type:'string',description:'Talent identifier.',ui:{label:'ID',widget:'hidden'}},
        name:{type:'string',description:'Candidate name.',ui:{label:'Name'}},
        headline:{type:'string',description:'Professional headline.',ui:{label:'Headline'}},
        location:{type:'string',description:'Current location.',ui:{label:'Location'}},
        experienceYears:{type:'integer',description:'Years of experience.',semantic:{unit:'years'},ui:{label:'Experience'}},
      })},
    }),
  }},
} as const satisfies PageSchema;
export type TalentParams=Params<typeof page.views.main>;
export type TalentState=Value<typeof page.views.main.returns>;
