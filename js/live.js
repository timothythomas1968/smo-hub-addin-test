// Live values in the edit forms: the same rules as the workbook formulas (workbook/builder/defs3.py),
// so a score, status or due date changes as you type rather than only after Save.
// calc: calculated columns (shown read-only). sugg: suggested columns, updated while the user has not typed over them.
// on: when a field changes, also change another one (marked as changed, so it is saved).
// Every rule gets v(header) = the field's current value, and the store (for RD, CloseDate and so on).
// A calculated field with no rule here shows "updates when you save" once something changes.

const num = (x) => (x === '' || x == null || isNaN(Number(x)) ? 0 : Number(x));
const blank = (x) => x === '' || x == null;

export const LIVE = {
  tblRisks: {
    calc: {
      Score: (v) => (blank(v('Likelihood (1-5)')) || blank(v('Impact (1-5)')) ? '' : num(v('Likelihood (1-5)')) * num(v('Impact (1-5)'))),
      Rating: (v) => {
        const s = blank(v('Likelihood (1-5)')) || blank(v('Impact (1-5)')) ? '' : num(v('Likelihood (1-5)')) * num(v('Impact (1-5)'));
        const st = v('Status (adopt or remove)');
        return s === '' || st === 'Remove' || st === 'Closed' ? '' : s >= 15 ? 'Red' : s >= 8 ? 'Amber' : 'Green';
      }
    }
  },
  tblIssues: {
    sugg: {
      Status: (v) => (blank(v('Issue')) ? '' : !blank(v('Closed date')) ? 'Closed' : 'Open'),
      'Due date': (v) => (blank(v('Issue')) || blank(v('Date raised')) ? '' : num(v('Date raised')) + (v('Priority') === 'High' ? 7 : v('Priority') === 'Low' ? 30 : 14))
    }
  },
  tblDecisions: {
    sugg: { Status: (v) => (blank(v('Decision needed')) ? '' : !blank(v('Decided on')) ? 'Made' : 'Open') }
  },
  tblActions: {
    sugg: {
      'Due date': (v) => (blank(v('Action')) || !num(v('Meeting date')) ? '' : num(v('Meeting date')) + 14),
      Status: (v) => (blank(v('Action')) ? '' : !blank(v('Closed on')) ? 'Closed' : 'Open')
    },
    calc: {
      Overdue: (v, store) => (v('Status') === 'Open' && !blank(v('Due date')) && num(v('Due date')) < num(store.names.RD) ? 'Overdue' : '')
    }
  },
  tblPlan: {
    sugg: {
      'Actual start': (v) => (num(v('% complete')) > 0 ? v('Planned start') : ''),
      'Actual finish': (v) => (num(v('% complete')) >= 1 ? v('Planned finish') : '')
    },
    calc: {
      // A TSA exit row's status also depends on its tasks, so it only updates on Save.
      Status: (v, store) => (v('Type') === 'TSA exit' ? undefined
        : num(v('% complete')) >= 1 ? 'Complete'
          : !blank(v('Planned finish')) && num(v('Planned finish')) < num(store.names.RD) ? 'Late'
            : num(v('% complete')) > 0 ? 'In progress' : 'Not started'),
      'Slippage (days)': (v) => (blank(v('Planned finish')) || blank(v('Baseline finish')) ? '' : num(v('Planned finish')) - num(v('Baseline finish')))
    },
    // Tim, 2 Nov 2026: an actual finish date means the activity is done.
    on: { 'Actual finish': (val, set) => { if (!blank(val)) set('% complete', 1); } }
  },
  tblPeople: {
    calc: {
      Quadrant: (v) => {
        const inf = v('Influence'), int = v('Interest');
        if (blank(inf) || blank(int)) return '';
        return inf === 'High' && int === 'High' ? 'Manage closely' : inf === 'High' ? 'Keep satisfied' : int === 'High' ? 'Keep informed' : 'Monitor';
      }
    }
  },
  tblTSA: {
    sugg: { 'Forecast exit date': (v) => v('Planned exit date') },
    calc: {
      'Exit type': (v) => (!num(v('Forecast exit date')) || !num(v('Planned exit date')) ? ''
        : num(v('Forecast exit date')) < num(v('Planned exit date')) ? 'Early exit' : num(v('Forecast exit date')) > num(v('Planned exit date')) ? 'Extension' : 'On time'),
      'Exit notice deadline': (v) => {
        if (blank(v('Forecast exit date'))) return '';
        const early = num(v('Forecast exit date')) < num(v('Planned exit date'));
        return num(v('Forecast exit date')) - num(early ? v('Early exit notice (days)') : v('On-time exit notice (days)'));
      },
      'Extension notice deadline': (v) => (blank(v('Planned exit date')) ? '' : num(v('Planned exit date')) - num(v('Extension notice (days)')))
    }
  },
  tblDay1: {
    calc: {
      'Due date': (v, store) => (blank(v('Task')) || blank(v('Days from Day 1')) || !num(store.names.CloseDate) || v('Status') === 'Not required' ? undefined
        : num(store.names.CloseDate) + num(v('Days from Day 1')))
    }
  },
  tblFirst100: {
    calc: {
      'Due date': (v, store) => (blank(v('Task')) || blank(v('Due on day')) || !num(store.names.CloseDate) || v('Status') === 'Not required' ? undefined
        : num(store.names.CloseDate) + num(v('Due on day')))
    }
  }
};
