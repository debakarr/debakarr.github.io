---
title: "[LeetCode] 144. Binary Tree Preorder Traversal"
date: "2019-05-15"
description: "Binary Tree Preorder Traversal Link to original Problem on LeetCode Given a binary tree, return the preorder traversal of its nodes’ values. Example: Output: [1, 3, 2] Follow up: Recursive solution is trivial, could you do it iteratively? Company: Microsoft, Amazon Recursive Solution: # Definition for a binary tree node. # class TreeNode(object): # def __init__(self, x): # self.val = x # self.left = None # self.right = None class Solution(object): def preorderTraversal(self, root): \"\"\" :type root: TreeNode :rtype: List[int] \"\"\" # Runtime: 16 ms # Memory Usage: 11."
categories: ["Algorithms", "Programming", "LeetCode"]
tags: ["Algorithms", "Binary Tree", "Preorder Traversal", "Programming"]
draft: false
---

### Binary Tree Preorder Traversal

[Link to original Problem on LeetCode](https://leetcode.com/problems/binary-tree-preorder-traversal/)

Given a binary tree, return the *preorder* traversal of its nodes’ values.

**Example:**

> Output: \[1, 3, 2\]

**Follow up**: Recursive solution is trivial, could you do it iteratively?

**Company:** *Microsoft*, *Amazon*

**Recursive Solution:**

```python
# Definition for a binary tree node.
# class TreeNode(object):
#     def __init__(self, x):
#         self.val = x
#         self.left = None
#         self.right = None

class Solution(object):
    def preorderTraversal(self, root):
        """
        :type root: TreeNode
        :rtype: List[int]
        """
        # Runtime: 16 ms
        # Memory Usage: 11.8 MB
        # Normal recursion solution
        returnList = []
        self.doPreOrderTraversal(root, returnList)
        return returnList

    def doPreOrderTraversal(self, root, returnList):
        if not root:
            return
        returnList.append(root.val)
        self.doPreOrderTraversal(root.left, returnList)
        self.doPreOrderTraversal(root.right, returnList)
```

**Iterative Solution:**

```python
# Definition for a binary tree node.
# class TreeNode(object):
#     def __init__(self, x):
#         self.val = x
#         self.left = None
#         self.right = None

class Solution(object):
    def preorderTraversal(self, root):
        """
        :type root: TreeNode
        :rtype: List[int]
        """
        # Runtime: 16 ms
        # Memory Usage: 11.6 MB
        # The idea is to maintain  a stack
        # Keep the root in the stack
        # While the stack is not empty add the top of the stack to returnList
        # Since we need left element first we will push it to the stack after right element
        # Once the stack is empty we are done
        returnList = []
        stack = []
        stack.append(root)

        while stack:
            toTraverse = stack.pop()
            if toTraverse:
                returnList.append(toTraverse.val)
                stack.append(toTraverse.right)
                stack.append(toTraverse.left)

        return returnList
```
