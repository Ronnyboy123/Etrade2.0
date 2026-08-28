import { ChevronRight, Users } from 'lucide-react';
import { getRowsForDeclarant } from '../lib/access.js';

export default function TeamWorkspaces({ workers, rows, leaders = [], onOpenWorkspace }) {
  const groups = Object.values(workers.reduce((acc, worker) => {
    const key = worker.teamId || 'unassigned';
    if (!acc[key]) acc[key] = { teamId: key, teamName: worker.teamName || 'Unassigned Team', workers: [] };
    acc[key].workers.push(worker);
    return acc;
  }, {}));

  return (
    <section className="team-page">
      <div className="section-heading">
        <div>
          <h2>TEAM WORKSPACES</h2>
          <p>Team leads see their own team. Assistant Manager and Manager can open every declarant workspace.</p>
        </div>
        <div className="section-icon"><Users size={22} /></div>
      </div>

      <div className="team-groups">
        {groups.map((group) => {
          const leader = leaders.find((item) => item.teamId === group.teamId);
          return (
            <div className="team-group" key={group.teamId}>
              <div className="team-group-heading">
                <div><strong>{group.teamName}</strong><span>{leader ? `${leader.name} — Team Lead` : 'Team Lead not configured'}</span></div>
                <span>{group.workers.length} declarant{group.workers.length === 1 ? '' : 's'}</span>
              </div>

              <div className="team-grid">
                {group.workers.map((worker) => {
                  const workerRows = getRowsForDeclarant(rows, worker.declarantName);
                  const delayed = workerRows.filter((r) => r.overall_status === 'DELAYED').length;
                  const actionDue = workerRows.filter((r) => r.overall_status === 'ACTION DUE').length;
                  const closed = workerRows.filter((r) => r.overall_status === 'CLOSED').length;
                  const open = workerRows.length - closed;

                  return (
                    <button className="team-card" key={worker.id} onClick={() => onOpenWorkspace(worker)}>
                      <div className="team-card-top">
                        <div className="avatar">{worker.name.slice(0, 1)}</div>
                        <div><strong>{worker.name}</strong><span>Customs Declarant</span></div>
                        <ChevronRight size={18} />
                      </div>
                      <div className="team-stats">
                        <div><span>Total</span><strong>{workerRows.length}</strong></div>
                        <div><span>Open</span><strong>{open}</strong></div>
                        <div><span>Action Due</span><strong>{actionDue}</strong></div>
                        <div><span>Delayed</span><strong>{delayed}</strong></div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
