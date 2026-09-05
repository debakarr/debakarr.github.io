---
title: "Delete stale git branches"
date: "2024-02-03"
description: "Find and delete remote Git branches inactive for 120+ days with Bash and PowerShell snippets, plus tips to speed up CI clones."
categories: ["Git", "Script", "Utility"]
tags: ["Git", "Stale Branch", "Delete"]
draft: false
---

# Deleting stale git branches

Working on monolithic projects with a large team of developers often leads to an accumulation of stale git branches. These branches may be left behind due to unresolved merge conflicts, abandoned tasks, or even employee turnover. Over time, this can result in repositories with thousands of inactive branches, potentially affecting your CI/CD process and increasing the time taken for git clone operations. To address this, we can implement a process to identify and delete stale branches that have been inactive for a certain period, say 120 days.

Here’s a step-by-step guide to streamline your git branches:

## Step 1: Notify Developers

Before deleting any branches, it’s a good practice to notify the developers, giving them a chance to update their branches if needed. Use the following commands in `bash` and `PowerShell` to identify branches that have been inactive for 120 days or more:

**Bash:**

```bash
git for-each-ref --sort=committerdate refs/ --format='%(committerdate:raw) %(refname:short) %(authoremail) %(committerdate)' | awk "\$1 < $(date -d "-120 days" "+%s") {printf \"%-25s | %s | %s %s %s %s %s\n\", \$3, \$4, \$5, \$6, \$7, \$8, \$9}" | grep origin
```

**PowerShell:**

```powershell
git for-each-ref --sort=committerdate refs/ --format='%(committerdate:raw) %(refname:short) %(authoremail) %(committerdate)' | ForEach-Object {
     $parts = $_ -split ' '
     $unixTimeCutoff = (New-TimeSpan -Start (Get-Date -Year 1970 -Month 1 -Day 1) -End (Get-Date).AddDays(-120)).TotalSeconds
     if ([double]$parts[0] -lt $unixTimeCutoff) {
         "{0,-25} | {1} | {2} {3} {4} {5} {6}" -f $parts[2], $parts[3], $parts[4], $parts[5], $parts[6], $parts[7], $parts[8]
     }
 } | Select-String -Pattern 'origin'
```

## Step 2: Delete Stale Branches

After notifying the developers, you can proceed to delete the stale branches using the following commands:

**Bash:**

```bash
git for-each-ref --sort=committerdate refs/ --format='%(committerdate:raw) %(refname:short) %(authorname) %(committerdate)' | awk "\$1 < $(date -d "-120 days" "+%s") {print(\$3)}" | grep origin | sed 's/origin\///g' | xargs -I {} git push origin --delete {}
```

**PowerShell:**

```powershell
git for-each-ref --sort=committerdate refs/ --format='%(committerdate:raw) %(refname:short) %(authorname) %(committerdate)' | ForEach-Object {
     $parts = $_ -split ' '
     $unixTimeCutoff = (New-TimeSpan -Start (Get-Date -Year 1970 -Month 1 -Day 1) -End (Get-Date).AddDays(-120)).TotalSeconds
     if ([double]$parts[0] -lt $unixTimeCutoff) {
         $branch = $parts[2] -replace '^origin/', ''
         if (![string]::IsNullOrWhiteSpace($branch)) {
             Write-Output "Deleting branch: $branch"
             git push origin --delete $branch
         }
     }
 }
```

## Understanding the Commands

Here’s a brief explanation of what’s happening in these commands:

1.  `git for-each-ref --sort=committerdate refs/ --format='%(committerdate:raw) %(refname:short) %(authorname) %(committerdate)'`: This command lists all references in the Git repository, sorted by committer date. The output includes the raw committer date, the short reference name, the author name, and the formatted committer date.
    
2.  `awk "\$1 < $(date -d "-120 days" "+%s") {print(\$3)}"`: This command filters the output of the previous command, printing the third field (the short reference name) of lines where the first field (the raw committer date) is older than 120 days.
    
3.  `grep origin`: This command filters the output of the previous command, keeping only lines that contain the string “origin”, which typically indicates remote branches.
    
4.  `sed 's/origin\///g'`: This command modifies the output of the previous command, removing the “origin/” prefix from the branch names.
    
5.  `xargs -I {} git push origin --delete {}`: This command executes a `git push` command for each line of the output of the previous command. It passes the branch names to the `git push origin --delete` command, which deletes the corresponding remote branches.
    

By following these steps, you can effectively manage your Git branches, keeping your repository clean and efficient. This not only improves the performance of your CI/CD process but also enhances the onboarding experience for new developers.

## Side Note: Optimizing Git Operations in CI/CD

In addition to managing stale branches, there are other strategies you can employ to optimize git operations within your CI/CD pipeline:

1.  **Clone Only Necessary Branches:** If your CI/CD process involves cloning your repository, consider cloning only the branches necessary for the build process. This can significantly reduce the time and resources required for the cloning operation. You can do this by using the `-b` option with the `git clone` command followed by the name of the branch you want to clone.
    
    Example: `git clone -b my-branch git://github.com/user/repo.git`
    
2.  **Use Shallow Clones:** Another strategy to improve cloning time is to create a shallow clone with a limited history. This can be achieved using the `--depth` option followed by the number of commits you want to include in the clone.
    
    Example: `git clone --depth 1 git://github.com/user/repo.git`
    
    This command creates a clone with only the most recent commit. This is particularly useful in CI/CD environments where the full history of the repository might not be necessary.
    

By implementing these strategies along with regular cleanup of stale branches, you can ensure efficient utilization of resources, faster build times, and an overall streamlined CI/CD process.
