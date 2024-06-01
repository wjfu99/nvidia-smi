// The module 'vscode' contains the VS Code extensibility API
// Import the necessary extensibility types to use in your code below
import { window, commands, Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, workspace } from "vscode"
import { platform } from "os"
const exec = require("child-process-promise").exec
const circleChars = ["◌", "◔", "◑", "◕", "◍"]
const barChars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"]
const recycleChars = ["♺", "♳", "♴", "♵", "♶", "♷", "♸", "♹"]
const dieChars = ["⛶", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"]
const clockChars = ["🕛", "🕐", "🕑", "🕒", "🕓", "🕔", "🕕", "🕖", "🕗", "🕘", "🕙", "🕚"]
const lineChars = ["⎽", "⎼", "⎻", "⎺"]
const pileChars = ["𝄖", "𝄗", "𝄘", "𝄙", "𝄚", "𝄛"]
const digitChars = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
const circledigitChars = ["🄋", "➀", "➁", "➂", "➃", "➄", "➅", "➆", "➇", "➈"]
const negativecircledigitChars = ["🄌", "➊", "➋", "➌", "➍", "➎", "➏", "➐", "➑", "➒"]
const wanChars = ["🀆", "🀈", "🀉", "🀊", "🀋", "🀌", "🀍", "🀎", "🀏"]
const tiaoChars = ["🀆", "🀐", "🀑", "🀒", "🀓", "🀔", "🀕", "🀖", "🀗", "🀘"]
const bingChars = ["🀆", "🀙", "🀚", "🀛", "🀜", "🀝", "🀞", "🀟", "🀠", "🀡"]
const drawtypes = {
    circle: circleChars,
    bar: barChars,
    recycle: recycleChars,
    die: dieChars,
    clock: clockChars,
    line: lineChars,
    pile: pileChars,
    digit: digitChars,
    circledigit: circledigitChars,
    negativecircledigit: negativecircledigitChars,
    wan: wanChars,
    tiao: tiaoChars,
    bing: bingChars
}
const cmd_gpu = `if [ $(command -v nvidia-smi &> /dev/null) ]; then 
nvidia-smi --query-gpu=utilization.gpu --format=csv | sed '1d' | awk -F, '{printf "%i\\n", \$1}'; 
else rocm-smi --alldevices --showuse --csv | sed '1d;$d' | awk -F, '{printf "%i\\n", $2}'; 
fi`
const cmd_mem = `if [ $(command -v nvidia-smi &> /dev/null) ]; then 
nvidia-smi --query-gpu=memory.used,memory.total --format=csv | sed '1d;s/ MiB//g' | awk -F, '{printf "%i\\n", \$1/\$2*100}'; 
else rocm-smi --alldevices --showmeminfo VRAM  --csv | sed '1d;$d' | awk -F, '{printf "%i\\n", $3 / $2 * 100}'; 
fi`

// This method is called when your extension is activated. Activation is
// controlled by the activation events defined in package.json.
export async function activate(context: ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error).
    // This line of code will only be executed once when your extension is activated.
    console.log('Congratulations, your extension "nvidia-smi" is now active!')

    // create a new word counter
    let nvidiasmi = new NvidiaSmi(0)
    try {
        var res = await exec(nvidiasmi.cmd_gpu, { timeout: 999 })
        console.log('res=')
        console.log(res)
        var nCard = res.stdout.split("\n").filter(val => val).length
        if (nCard > 0) {
            nvidiasmi.nCard = nCard
            nvidiasmi.startNvidiaSmi()
        }
    } catch (e) {
        console.log(e)
        nvidiasmi.nCard = 0
    }

    let updateCmd = commands.registerCommand("extension.nvidia-smi", () => {
        nvidiasmi.updateNvidiaSmi()
    })

    let stopCmd = commands.registerCommand("extension.stop_nvidia-smi", () => {
        nvidiasmi.stopNvidiaSmi()
    })

    let startCmd = commands.registerCommand("extension.start_nvidia-smi", () => {
        nvidiasmi.startNvidiaSmi()
    })

    context.subscriptions.push(
        workspace.onDidChangeConfiguration(() => {
            nvidiasmi.updateDrawtype()
            nvidiasmi.updateGPUtype()
            nvidiasmi.updatenCard()
        })
    )

    // Add to a list of disposables which are disposed when this extension is deactivated.
    context.subscriptions.push(nvidiasmi)
    context.subscriptions.push(updateCmd)
    context.subscriptions.push(startCmd)
    context.subscriptions.push(stopCmd)
}

class NvidiaSmi {
    private _statusBarItem: StatusBarItem
    private _interval: NodeJS.Timer
    private _nCard: number
    private _indicator: string[]
    private gputype: string
    private _cmd_gpu: string
    private _cmd_mem: string
    private _patience: number
    public lock: boolean

    constructor(numCard: number) {
        this.lock = false
        this.resetPatience()
        this.nCard = numCard
        this.updateDrawtype()
        this.updateGPUtype()
        this.updatenCard()
    }

    get hasPatience(): boolean {
        return this._patience > 0
    }

    get nCard(): number {
        return this._nCard
    }

    set nCard(numCard: number) {
        if (numCard >= 0) {
            this._nCard = numCard
        } else {
            console.log("Error: bad value of numCard!")
        }
    }

    get indicator(): string[] {
        return this._indicator
    }

    set indicator(ind: string[]) {
        this._indicator = ind
    }

    get cmd_gpu(): string {
        return this._cmd_gpu
    }

    set cmd_gpu(cmd: string) {
        this._cmd_gpu = cmd
    }

    get cmd_mem(): string {
        return this._cmd_mem
    }

    set cmd_mem(cmd: string) {
        this._cmd_mem = cmd
    }

    public decPatience() {
        if (this.hasPatience) {
            this._patience -= 1
        }
    }

    public resetPatience() {
        this._patience = 5
    }

    public updateDrawtype() {
        var drawtype = workspace.getConfiguration("nvidia-smi").drawtype
        this.indicator = drawtypes[drawtype]
    }

    public updateGPUtype() {
        var gputype = workspace.getConfiguration("nvidia-smi").gputype
        if (gputype == "NVIDIA") {
            this.cmd_gpu = `nvidia-smi --query-gpu=utilization.gpu --format=csv | sed '1d' | awk -F, '{printf "%i\\n", \$1}'`
            this.cmd_mem = `nvidia-smi --query-gpu=memory.used,memory.total --format=csv | sed '1d;s/ MiB//g' | awk -F, '{printf "%i\\n", \$1/\$2*100}'`
        } else if (gputype == "AMD") {
            this.cmd_gpu = `rocm-smi --alldevices --showuse --csv | sed '1d;$d' | awk -F, '{printf "%i\\n", $2}'`
            this.cmd_mem = `rocm-smi --alldevices --showmeminfo VRAM  --csv | sed '1d;$d' | awk -F, '{printf "%i\\n", $3 / $2 * 100}'`
        }
    }

    public updatenCard() {
        try {
            var res = exec(this.cmd_gpu, { timeout: 999 })
            console.log('res=')
            console.log(res)
            var nCard = res.stdout.split("\n").filter(val => val).length
            if (nCard > 0) {
                this.nCard = nCard
            }
        } catch (e) {
            console.log(e)
        }
    }

    public async updateNvidiaSmi() {
        if (this.nCard == 0) return
        if (this.lock) return

        // Create as needed
        if (!this._statusBarItem) {
            this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 1)
            this._statusBarItem.show()
        }

        try {
            this.lock = true
            var res_gpu = await exec(this.cmd_gpu, { timeout: 999 })
            var res_mem = await exec(this.cmd_mem, { timeout: 999 })
            var levels_gpu = res_gpu.stdout.split("\n").filter(val => val)
            var levels_mem = res_mem.stdout.split("\n").filter(val => val)
            var chars = this.indicator
            var nlevel = chars.length - 1
            var levelChars_gpu = levels_gpu.map(val => chars[Math.ceil((Number(val) / 100) * nlevel)])
            var levelChars_mem = levels_mem.map(val => chars[Math.ceil((Number(val) / 100) * nlevel)])
            this.lock = false
        } catch (e) {
            console.log(e)
            this.lock = true
        }

        // Update the status bar
        this._statusBarItem.text = "$(nvidia-logo) | $(gpu-usage)" + " " + levelChars_gpu.join(",") + " | $(gpu-memory)" + " " + levelChars_mem.join(",");
        let levels_zipped = levels_gpu.map((val, index) => [val, levels_mem[index]])
        this._statusBarItem.tooltip = levels_zipped.map((val, index) => `GPU${index}: GPU-Usage: ${val[0]}%, GPU-Memory: ${val[1]}%`).join("\n");
    }

    public async stopNvidiaSmi() {
        if (this._interval) {
            clearInterval(this._interval)
        }
        if (this._statusBarItem) {
            this._statusBarItem.text = ""
            this._statusBarItem.tooltip = ""
        }
    }

    public async startNvidiaSmi() {
        if (this.nCard == 0) return

        this._interval = setInterval(() => {
            this.updateNvidiaSmi()
        }, 2000)
    }

    dispose() {
        this._statusBarItem.dispose()
        if (this._interval) {
            clearInterval(this._interval)
        }
    }
}
