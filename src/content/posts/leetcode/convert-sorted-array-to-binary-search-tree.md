---
title: "[LeetCode] 108. Convert Sorted Array to Binary Search Tree"
date: "2019-09-06"
description: "Convert Sorted Array to Binary Search Tree Link to original Problem on LeetCode Given an array where elements are sorted in ascending order, convert it to a height balanced BST. For this problem, a height-balanced binary tree is defined as a binary tree in which the depth of the two subtrees of every node never differ by more than 1. Example: Given the sorted array: [-10,-3,0,5,9], One possible answer is: [0,-3,9,-10,null,5], which represents the following height balanced BST:"
categories: ["Algorithms", "Programming", "LeetCode"]
tags: ["Algorithms", "Binary Search Tree", "Conversion", "Programming"]
draft: false
---

### Convert Sorted Array to Binary Search Tree

[Link to original Problem on LeetCode](https://leetcode.com/problems/convert-sorted-array-to-binary-search-tree/)

Given an array where elements are sorted in ascending order, convert it to a height balanced BST.

For this problem, a height-balanced binary tree is defined as a binary tree in which the depth of the two subtrees of every node never differ by more than 1.

**Example**:

Given the sorted array: \[-10,-3,0,5,9\],

One possible answer is: \[0,-3,9,-10,null,5\], which represents the following height balanced BST:

**Company:** *Amazon*, *VMWare*

**Solution (Using Recursion):**

**Time Complexity:** **Space Complexity:**

```python
# Definition for a binary tree node.
# class TreeNode(object):
#     def __init__(self, x):
#         self.val = x
#         self.left = None
#         self.right = None

class Solution(object):
    def sortedArrayToBST(self, nums):
        """
        :type nums: List[int]
        :rtype: TreeNode
        """
        # The idea is in each loop tale the middle element
        # Make an object of TreeNode with value as the middle element
        # Now all the values left to this middle element will be part of the left sub tree
        # Likewise all the values right to this middle element will be part of right sub tree
        # We have to recursively call this method and assigne the middle element of all the value to left of current middle element to the left node
        # Same for the right node 
        if not nums:
            return None
        
        mid = len(nums) // 2
        
        root = TreeNode(nums[mid])
        root.left = self.sortedArrayToBST(nums[:mid])
        root.right = self.sortedArrayToBST(nums[mid + 1:])
        
        return root
```

**Solution (Using Recursion - helper method):**

**Time Complexity:** **Space Complexity:**

```python
# Definition for a binary tree node.
# class TreeNode(object):
#     def __init__(self, x):
#         self.val = x
#         self.left = None
class Solution(object):
    def sortedArrayToBST(self, nums):
        """
        :type nums: List[int]
        :rtype: TreeNode
        """
        # Here concept is same but we are using a helper method
        if not nums:
            return None
           
        return self.helper(nums, 0, len(nums))
    
    def helper(self, nums, left, right):
        if left >= right:
            return None
        
        mid = (left + right) // 2
        
        root = TreeNode(nums[mid])
        root.left = self.helper(nums, left, mid)
        root.right = self.helper(nums, mid + 1, right)
        
        return root

<hr><br />
```
