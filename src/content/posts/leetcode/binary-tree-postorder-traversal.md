---
title: "[LeetCode] 145. Binary Tree Postorder Traversal"
date: "2019-05-15"
description: "Binary Tree Postorder Traversal Link to original Problem on LeetCode Given a binary tree, return the postorder traversal of its nodes’ values. Example: Output: [3,2,1] Follow up: Recursive solution is trivial, could you do it iteratively? Company: Microsoft, Amazon Recursive Solution: # Definition for a binary tree node. # class TreeNode(object): # def __init__(self, x): # self.val = x # self.left = None # self.right = None class Solution(object): def postorderTraversal(self, root): \"\"\" :type root: TreeNode :rtype: List[int] \"\"\" # Runtime: 16 ms # Memory Usage: 11."
categories: ["Algorithms", "Programming", "LeetCode"]
tags: ["Algorithms", "Binary Tree", "Postorder Traversal", "Programming"]
draft: false
---

### Binary Tree Postorder Traversal

[Link to original Problem on LeetCode](https://leetcode.com/problems/binary-tree-postorder-traversal/)

Given a binary tree, return the *postorder* traversal of its nodes’ values.

**Example:**

> Output: \[3,2,1\]

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
    def postorderTraversal(self, root):
        """
        :type root: TreeNode
        :rtype: List[int]
        """
        # Runtime: 16 ms
        # Memory Usage: 11.9 MB
        # Normal recursion solution
        returnList = []
        self.doPostOrderTraversal(root, returnList)
        return returnList

    def doPostOrderTraversal(self, root, returnList):
        if not root:
            return
        self.doPostOrderTraversal(root.left, returnList)
        self.doPostOrderTraversal(root.right, returnList)
        returnList.append(root.val)
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
    def postorderTraversal(self, root):
        """
        :type root: TreeNode
        :rtype: List[int]
        """
        # Runtime: 8 ms
        # Memory Usage: 11.8 MB
        # The idea here is to maintain 2 stack.
        # One will be use to traverse the tree and keep track of left and right child
        # In the second stack we will keep on pushing those node whose child we have visited

        # If tree is empty then return empty list
        if root == None:
            return []

        # Initialize two empty list.
        # These list we can use to implement 2 stack
        firstStack, secondStack = [], []
        # Add root to the 1st Stack
        firstStack.append(root)
        returnList = []

        # While first stack is not empty, add the top of 1st stack to 2nd stack
        # Add left and right of the pushed node to 1st stack
        while firstStack:
            moveToSecond = firstStack.pop()
            secondStack.append(moveToSecond)
            if moveToSecond.left:
                firstStack.append(moveToSecond.left)
            if moveToSecond.right:
                firstStack.append(moveToSecond.right)

        # While second stack is not empty then push the top node to returnList
        while secondStack:
            returnList.append(secondStack.pop().val)
        return returnList
```
