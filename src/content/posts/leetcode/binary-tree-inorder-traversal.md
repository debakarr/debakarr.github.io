---
title: "[LeetCode] 94. Binary Tree Inorder Traversal"
date: "2019-05-15"
description: "Binary Tree Inorder Traversal Link to original Problem on LeetCode Given a binary tree, return the inorder traversal of its nodes’ values. Example: Output: [1, 2, 3] Follow up: Recursive solution is trivial, could you do it iteratively? Company: Microsoft, Amazon Recursive Solution: # Definition for a binary tree node. # class TreeNode(object): # def __init__(self, x): # self.val = x # self.left = None # self.right = None class Solution(object): def inorderTraversal(self, root): \"\"\" :type root: TreeNode :rtype: List[int] \"\"\" # Runtime: 12 ms # Memory Usage: 11."
categories: ["Algorithms", "Programming", "LeetCode"]
tags: ["Algorithms", "Binary Tree", "Inorder Traversal", "Programming"]
draft: false
---

### Binary Tree Inorder Traversal

[Link to original Problem on LeetCode](https://leetcode.com/problems/binary-tree-inorder-traversal/)

Given a binary tree, return the *inorder* traversal of its nodes’ values.

**Example:**

> Output: \[1, 2, 3\]

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
    def inorderTraversal(self, root):
        """
        :type root: TreeNode
        :rtype: List[int]
        """
        # Runtime: 12 ms
        # Memory Usage: 11.8 MB
        # Normal recursion solution
        returnList = []
        self.doInOrderTraversal(root, returnList)
        return returnList

    def doInOrderTraversal(self, root, returnList):
        if not root:
            return
        self.doInOrderTraversal(root.left, returnList)
        returnList.append(root.val)
        self.doInOrderTraversal(root.right, returnList)
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
    def inorderTraversal(self, root):
        """
        :type root: TreeNode
        :rtype: List[int]
        """
        # Runtime: 12 ms
        # Memory Usage: 11.6 MB
        # Here the idea is to push every left node to the stack
        # If there is no left node available pop and add top of stack to returnList,
        # then go to right and from there also go to very left
        # Once both stack is empty and root is None, break
        returnList = []
        stack = []

        while True:
            # Go as left as possible and with each node travesed add it to stack
            if root:
                stack.append(root)
                root = root.left
            # If there is no left the pop from stack
            # Add it to the returnList and go to the right
            # If right is not there again check whether stack is empty
            elif stack:
                root = stack.pop()
                returnList.append(root.val)
                root = root.right
            # If root is None and stack is empty then break
            else:
                break

        return returnList
```
