import React from 'react';
import {mountPage,usePageContext} from '@recruitment/page';
import {PageShell} from '@recruitment/page/ui';
import {Viz} from '@recruitment/page/viz';
import {report} from './page.viz';
import './style.css';
export const mount=mountPage(RecruitmentOverview);
function RecruitmentOverview(){
  const context=usePageContext();
  return <PageShell title={context.page.title} description="A clear view of your recruiting activity.">
    <Viz definition={report}/>
    <p className="mt-5 text-xs text-muted-foreground">Counts reflect each application's current stage, grouped by creation date. Date windows use UTC. Department rankings show the top 8; jobs show the top 10.</p>
  </PageShell>;
}
