import * as vscode from 'vscode';
import * as path from 'path';

type LaunchAL = { name?: string; tenant?: string; environmentName?: string; environmentType?: string; request?: string; type?: string; };

function getAllAlLaunchConfigs(): LaunchAL[] {
    const launchCfg = vscode.workspace.getConfiguration('launch') as any;
    const configs: any[] = launchCfg.get('configurations') || [];
    return configs.filter(c => c?.type === 'al' && (c?.request === 'launch' || c?.request === 'attach'));
}

async function selectLaunchConfig(): Promise<LaunchAL | undefined> {
    const alConfigs = getAllAlLaunchConfigs();
    if (alConfigs.length === 0) return undefined;
    if (alConfigs.length === 1) return alConfigs[0];

    const pick = await vscode.window.showQuickPick(
        alConfigs.map(cfg => ({
            label: cfg.name ?? cfg.environmentName ?? '(unnamed)',
            description: `${cfg.environmentName ?? ''}${cfg.tenant ? ' · tenant ' + cfg.tenant : ''}${cfg.environmentType ? ' · ' + cfg.environmentType : ''}`,
            detail: cfg.request === 'attach' ? 'attach session' : 'launch',
            cfg
        })), { placeHolder: 'Select Business Central environment to deploy to' }
    );
    return (pick as any)?.cfg as LaunchAL | undefined;
}

async function pickAppJsonUri(): Promise<vscode.Uri> {
    const active = vscode.window.activeTextEditor?.document.uri;
    if (active) {
        const folder = vscode.workspace.getWorkspaceFolder(active);
        if (folder) {
            const nearest = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/app.json'), '**/{.alpackages,.snapshots,node_modules,.git}/**', 1);
            if (nearest.length) return nearest[0];
        }
    }
    const roots = vscode.workspace.workspaceFolders ?? [];
    const candidates: vscode.Uri[] = [];
    for (const r of roots) {
        const found = await vscode.workspace.findFiles(new vscode.RelativePattern(r, '**/app.json'), '**/{.alpackages,.snapshots,node_modules,.git}/**', 1);
        if (found.length) candidates.push(found[0]);
    }
    if (!candidates.length) throw new Error('No app.json found in the workspace.');
    if (candidates.length === 1) return candidates[0];
    const pick = await vscode.window.showQuickPick(
        candidates.map(u => ({ label: path.basename(path.dirname(u.fsPath)), detail: u.fsPath, u })),
        { placeHolder: 'Select the AL app to deploy' }
    );
    if (!pick) throw new Error('Cancelled.');
    // @ts-ignore
    return (pick as any).u as vscode.Uri;
}

export async function cloudSyncDeployPTE() {
    // 1) Choose app.json
    const appJsonUri = await pickAppJsonUri();
    const appDoc = await vscode.workspace.openTextDocument(appJsonUri);
    const appJson = JSON.parse(appDoc.getText());
    const appName: string = appJson.name;

    // 2) Choose environment (QuickPick if multiple)
    const chosen = await selectLaunchConfig();
    const envName = chosen?.environmentName
        ?? vscode.workspace.getConfiguration('pte').get<string>('environment', 'Sandbox');

    // 3) Open terminal & print header (rest of flow hooks into your PS logic)
    const shell = vscode.workspace.getConfiguration('pte').get<string>('shell', 'pwsh') || 'pwsh';
    const term = vscode.window.createTerminal({ name: 'CloudSync AL', shellPath: shell });
    term.show(true);

    const header = [
        '════════════════════════════════════════════════════════════',
        '   CloudSync AL · Deploy PTE',
        '════════════════════════════════════════════════════════════',
        ` App : ${appName}`,
        ` Env : ${envName}`,
        '',
        ' ── Steps ──────────────────────────────────────────────────'
    ].join('\n');
    term.sendText(header);
    term.sendText(' [1] Detect app & environment        ✔');
    term.sendText(`       ↳ Found ${appName} in ${path.dirname(appJsonUri.fsPath)}/app.json`);
    term.sendText('');
    term.sendText(' (Compiling… / Deploying… steps will run here in your PS flow)');
}

export function activate(ctx: vscode.ExtensionContext) {
    ctx.subscriptions.push(
        vscode.commands.registerCommand('cloudsync.deploy', cloudSyncDeployPTE)
    );
}

export function deactivate() { }
