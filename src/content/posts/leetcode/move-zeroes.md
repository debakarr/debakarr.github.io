---
title: "[LeetCode] 283. Move Zeroes"
date: "2019-07-25"
description: "Move Zeroes Link to original Problem on LeetCode Given an array nums, write a function to move all 0’s to the end of it while maintaining the relative order of the non-zero elements. Example: Input: [0,1,0,3,12] Output: [1,3,12,0,0] Note: You must do this in-place without making a copy of the array. Minimize the total number of operations. Company: Amazon, Bloomberg, Paytm, Samsung Solution: Time Complexity: O(n) Space Complexity: O(1) class Solution(object): def moveZeroes(self, nums): \"\"\" :type nums: List[int] :rtype: None Do not return anything, modify nums in-place instead."
categories: ["Programming", "Algorithms", "LeetCode"]
tags: ["Move Zeroes", "Two Pointers", "Array", "LeetCode", "Algorithm"]
draft: false
---

### Move Zeroes

[Link to original Problem on LeetCode](https://leetcode.com/problems/move-zeroes/)

Given an array **nums**, write a function to move all **0’s** to the end of it while maintaining the relative order of the non-zero elements.

**Example:**

**Input:** \[0,1,0,3,12\] **Output:** \[1,3,12,0,0\]

**Note:**

You must do this **in-place** without making a copy of the array. Minimize the total number of operations.

**Company:** *Amazon*, *Bloomberg*, *Paytm*, *Samsung*

**Solution:**

**Time Complexity:** O(n) **Space Complexity:** O(1)

```python
class Solution(object):
    def moveZeroes(self, nums):
        """
        :type nums: List[int]
        :rtype: None Do not return anything, modify nums in-place instead.
        """
        # One solution will be to keep track of where to place the next non-zero number
        # We have to start with index 0
        index = 0
        
        for i in range(len(nums)):
            if nums[i] != 0:
                nums[index] = nums[i]
                index += 1
                
        # Once we have traverse through the whole list we now basically have count of the non-zero number in index
        # i.e. number of non-zero element = index
        # and number of zeroes = len(nums) - index
        # So we fill all the remaining places (len(nums) - index) with zeroes
                
        for i in range(index, len(nums)):
            nums[i] = 0
```

**Solution (Optimal):**

**Time Complexity:** O(n) **Space Complexity:** O(1)

```python
class Solution(object):
    def moveZeroes(self, nums):
        """
        :type nums: List[int]
        :rtype: None Do not return anything, modify nums in-place instead.
        """
        # Another solution which is same as the previous one but more optimal
        # Instead of replacing the number at the particular index, 
        # we can swap it with the one which is present in the index where we need to place non-zero number
        # We have to start with index 0
        index = 0
        
        for i in range(len(nums)):
            if nums[i] != 0:
                nums[index], nums[i] = nums[i], nums[index]
                index += 1
```
