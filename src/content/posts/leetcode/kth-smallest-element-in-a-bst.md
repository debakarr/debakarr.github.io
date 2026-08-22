---
title: "[LeetCode] 230. Kth Smallest Element in a BST"
date: "2019-09-05"
description: "Kth Smallest Element in a BST Link to original Problem on LeetCode Given a binary search tree, write a function kthSmallest to find the kth smallest element in it. Note: You may assume k is always valid, 1 ≤ k ≤ BST’s total elements. Example 1: Input: root = [3,1,4,null,2], k = 1 Output: 1 Example 2: Input: root = [5,3,6,2,4,null,null,1], k = 3 Output: 3 Follow up: What if the BST is modified (insert/delete operations) often and you need to find the kth smallest frequently?"
categories: ["Algorithms", "Programming", "LeetCode"]
tags: ["Algorithms", "Binary Search Tree", "Kth Smallest", "Programming"]
draft: false
---

### Kth Smallest Element in a BST

[Link to original Problem on LeetCode](https://leetcode.com/problems/kth-smallest-element-in-a-bst/)

Given a binary search tree, write a function **k**thSmallest to find the **k**th smallest element in it.

**Note**: You may assume k is always valid, 1 ≤ k ≤ BST’s total elements.

**Example 1**:

**Input**: root = \[3,1,4,null,2\], k = 1

**Output**: 1

**Example 2**:

**Input**: root = \[5,3,6,2,4,null,null,1\], k = 3

**Output**: 3

**Follow up**: What if the BST is modified (insert/delete operations) often and you need to find the kth smallest frequently? How would you optimize the kthSmallest routine?

**Company:** *Amazon*

**Solution (Using stack):**

**Time Complexity:** O(h + k) # Were h is height of the tree **Space Complexity:** O(h + k) # Were h is height of the tree

```python
# Definition for a binary tree node.
# class TreeNode(object):
#     def __init__(self, x):
#         self.val = x
#         self.left = None
#         self.right = None

class Solution(object):
    def kthSmallest(self, root, k):
        """
        :type root: TreeNode
        :type k: int
        :rtype: int
        """
        # We can keep all the left node to a stack till we can't find any left node 
        stack = []
        
        while root:
            stack.append(root)
            root = root.left
           
        # Now in a loop we will decreament k till it reaches 0 
        while k:
            k -= 1
           
            # We pop the last node inserted 
            # (Note: For 1st iteration, this is the 1st smallest node, for 2nd iteration we get 2nd smallest node, and so on) 
            currNode = stack.pop()
           
            # If k == 0, then we got our kth element 
            if k == 0:
                return currNode.val
           
            # If the current node has right node, we have to push it to the stack, followed by all the left node of that node
            # This is because for any node in a stack, it is already the left most node (smallest),
            # But next pop element would be parent of that node which will be greater than the node to the right of current pop node 
            # For example, In example 1, the stack will have | 3 | 1 |,
            # On first iteration we will pop 1, now we have to push all the left node in right sub tree of 1, here we have only one i.e. 2
            # So stack after insertion of all left node in right sub tree will be | 3 | 2 |
            right = currNode.right
            
            while right:
                stack.append(right)
                right = right.left
```

**Solution (Using Recursion):**

**Time Complexity:** O(n) **Space Complexity:** O(n)

```python
# Definition for a binary tree node.
# class TreeNode(object):
#     def __init__(self, x):
#         self.val = x
#         self.left = None
#         self.right = None

class Solution(object):
    def kthSmallest(self, root, k):
        """
        :type root: TreeNode
        :type k: int
        :rtype: int
        """
        # We can create array using in-order traversal
        # Inorder traversal of binary tree is a sorted array
        # We can just return the k - 1, since index of array starts at 0 in Python      
        return self.inOrder(root)[k - 1]
    
    def inOrder(self, root):
        return self.inOrder(root.left) + [root.val] + self.inOrder(root.right) if root else []
```
