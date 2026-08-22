---
title: "[Leetcode] 104. Maximum Depth of Binary Tree"
date: "2019-07-23"
description: "Maximum Depth of Binary Tree Link to original Problem on LeetCode Given a binary tree, find its maximum depth. The maximum depth is the number of nodes along the longest path from the root node down to the farthest leaf node. Note: A leaf is a node with no children. Example: Given binary tree [3,9,20,null,null,15,7], return its depth = 3. Company: Goldman Sachs, Facebook, Bloomberg, Microsoft Solution (Iterative using breadth first search):"
categories: ["Programming", "Algorithms", "LeetCode"]
tags: ["Maximum Depth of Binary Tree", "Tree", "Depth-First Search", "LeetCode", "Algorithm"]
draft: false
---

### Maximum Depth of Binary Tree

[Link to original Problem on LeetCode](https://leetcode.com/problems/maximum-depth-of-binary-tree/)

Given a binary tree, find its maximum depth.

The maximum depth is the number of nodes along the longest path from the root node down to the farthest leaf node.

**Note: A leaf is a node with no children.**

**Example:**

Given binary tree \[3,9,20,null,null,15,7\],

return its depth = 3.

**Company:** *Goldman Sachs*, *Facebook*, *Bloomberg*, *Microsoft*

**Solution (Iterative using breadth first search):**

```python
class Solution(object):
    def maxDepth(self, root):
        """
        :type root: TreeNode
        :rtype: int
        """
        # Do BFS and at each level increase the count
        if root is None:
            return 0
        
        queue, count = [root], 0
        
        while queue:
            count += 1
            for i in range(len(queue)):
                node = queue.pop(0)
                if node.left:
                    queue.append(node.left)
                if node.right:
                    queue.append(node.right)
            print
        return count
```

**Solution (Recursive using depth first search):**

```python
class Solution(object):
    def maxDepth(self, root):
        """
        :type root: TreeNode
        :rtype: int
        """
        # Using DFS keep the max count in each recursive call
        if root == None:
            return 0
        
        return 1 + max(self.maxDepth(root.left), self.maxDepth(root.right))
```
