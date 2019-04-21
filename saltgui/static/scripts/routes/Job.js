import {DropDownMenu} from '../DropDown.js';
import {Output} from '../output/Output.js';
import {Route} from './Route.js';
import {TargetType} from '../TargetType.js';
import {Utils} from '../Utils.js';

export class JobRoute extends Route {

  constructor(router) {
    super("^[\/]job$", "Job", "#page_job", "", router);
    this._handleRunnerJobsListJob = this._handleRunnerJobsListJob.bind(this);
    this._handleRunnerJobsActive = this._handleRunnerJobsActive.bind(this);
  }

  onShow() {
    const job = this;
    const id = decodeURIComponent(Utils.getQueryParam("id"));
    return new Promise(function(resolve, reject) {
      job.resolvePromise = resolve;
      job.router.api.getRunnerJobsListJob(id).then(job._handleRunnerJobsListJob);
      job.router.api.getRunnerJobsActive().then(data => {
        job._handleRunnerJobsActive(id, data);
      });
    });
  }

  _isResultOk(result) {
    if(!result.success) return false;
    if(result.retcode !== 0) return false;
    return true;
  }

  _handleRunnerJobsListJob(data) {
    const job = this;
    const info = data.return[0];
    job.getPageElement().querySelector(".output").innerText = "";

    document.querySelector("#button_close_job").addEventListener("click", _ => {
      window.history.back();
    });

    const argumentsText = this._decodeArgumentsText(info.Arguments);
    const commandText = info.Function + argumentsText;
    const jobinfo = document.getElementById("job_page");
    const menuSection = jobinfo.querySelector(".job_menu");
    const menu = new DropDownMenu(menuSection);

    // 1: re-run with original target pattern
    menu.addMenuItem("Re-run&nbsp;job...", function(evt) {
      this._runFullCommand(evt, info["Target-type"], info.Target, commandText);
    }.bind(this));

    // 2: re-run list of minions
    let minionList = "";
    if(info.Minions) {
      for(const m of info.Minions) {
        minionList += "," + m;
      }
    }
    if(minionList && minionList === "," + info.Minions[0]) {
      // suppress a trivial case
      minionList = null;
    }
    if(minionList) {
      const lst = minionList.substring(1);
      menu.addMenuItem("Re-run&nbsp;job&nbsp;on&nbsp;all&nbsp;minions...", function(evt) {
        this._runFullCommand(evt, "list", lst, commandText);
      }.bind(this));
    }

    // 3: re-run all failed (error+timeout)
    minionList = "";
    let has1 = false, has2 = false;
    if(info.Minions) {
      for(const m of info.Minions) {
        if(!(m in info.Result)) has1 = true;
        if(m in info.Result && !this._isResultOk(info.Result[m])) has2 = true;
        if(!(m in info.Result) || !this._isResultOk(info.Result[m])) {
          minionList += "," + m;
        }
      }
    }
    // only when we have both types in the list
    // otherwise the #4 or #5 is sufficient
    if(has1 && has2 && minionList) {
      const lst = minionList.substring(1);
      menu.addMenuItem("Re-run&nbsp;job&nbsp;on&nbsp;unsuccessful&nbsp;minions...", function(evt) {
        this._runFullCommand(evt, "list", lst, commandText);
      }.bind(this));
    }

    // 4: re-run all failed (error)
    minionList = "";
    if(info.Minions) {
      for(const m of info.Minions) {
        if(m in info.Result && !this._isResultOk(info.Result[m])) {
          minionList += "," + m;
        }
      }
    }
    if(minionList) {
      const lst = minionList.substring(1);
      menu.addMenuItem("Re-run&nbsp;job&nbsp;on&nbsp;failed&nbsp;minions...", function(evt) {
        this._runFullCommand(evt, "list", lst, commandText);
      }.bind(this));
    }

    // 5: re-run all failed (timeout)
    minionList = "";
    if(info.Minions) {
      for(const m of info.Minions) {
        if(!(m in info.Result)) {
          minionList += "," + m;
        }
      }
    }
    if(minionList) {
      const lst = minionList.substring(1);
      menu.addMenuItem("Re-run&nbsp;job&nbsp;on&nbsp;non&nbsp;responding&nbsp;minions...", function(evt) {
        this._runFullCommand(evt, "list", lst, commandText);
      }.bind(this));
    }

    // 6: kill with original target pattern
    const jid = decodeURIComponent(Utils.getQueryParam("id"));
    menu.addMenuItem("Terminate&nbsp;job...", function(evt) {
      this._runFullCommand(evt, info["Target-type"], info.Target, "saltutil.signal_job " + jid + " 15");
    }.bind(this));

    const functionText = commandText + " on " +
      TargetType.makeTargetText(info["Target-type"], info.Target);
    jobinfo.querySelector(".function").innerText = functionText;

    jobinfo.querySelector(".time").innerText = Output.dateTimeStr(info.StartTime);

    const output = job.getPageElement().querySelector(".output");
    // use same formatter as direct commands
    let minions = ["WHEEL"];
    if(info.Minions) minions = info.Minions;
    Output.addResponseOutput(output, minions, info.Result, info.Function, "(loading)");

    this.resolvePromise();
  }

  _handleRunnerJobsActive(id, data) {
    const info = data.return[0][id];

    const summaryJobsActiveSpan = this.getPageElement().querySelector("pre.output span#summary_jobsactive");
    if(!summaryJobsActiveSpan) return;

    // when the job is already completely done, nothing is returned
    if(!info) {
      summaryJobsActiveSpan.innerText = "done, ";
      return;
    }

    summaryJobsActiveSpan.innerText = info.Running.length + " active, ";

    // update the minion details
    for(const minionInfo of info.Running) {
      // each minionInfo is like {'minion': pid}
      for(const minion in minionInfo) {
        const pid = minionInfo[minion];
        const noResponseSpan = this.getPageElement().querySelector("pre.output div#" + minion + " span.noresponse");
        if(!noResponseSpan) continue;

        // show that this minion is still active on the request
        noResponseSpan.innerText = "(active) ";

        const linkPsProcInfo = document.createElement("a");
        linkPsProcInfo.innerText = "info";
        linkPsProcInfo.style.cursor = "pointer";
        linkPsProcInfo.addEventListener("click", evt => {
          this._runFullCommand(evt, "list", minion, "ps.proc_info " + pid);
        });
        noResponseSpan.appendChild(linkPsProcInfo);

        noResponseSpan.appendChild(document.createTextNode(" "));

        const linkPsKillPid = document.createElement("a");
        linkPsKillPid.innerText = "kill";
        linkPsKillPid.style.cursor = "pointer";
        linkPsKillPid.addEventListener("click", evt => {
          this._runFullCommand(evt, "list", minion, "ps.kill_pid " + pid);
        });
        noResponseSpan.appendChild(linkPsKillPid);

        noResponseSpan.classList.remove("noresponse");
        noResponseSpan.classList.add("active");
      }
    }
  }
}
