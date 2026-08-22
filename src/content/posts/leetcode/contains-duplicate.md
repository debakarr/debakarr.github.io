---
title: "[LeetCode] 217. Contains Duplicate"
date: "2019-09-04"
description: "Contains Duplicate Link to original Problem on LeetCode Given an array of integers, find if the array contains any duplicates. Your function should return true if any value appears at least twice in the array, and it should return false if every element is distinct. Example 1: Input: [1,2,3,1] Output: true Example 2: Input: [1,2,3,4] Output: false Example 3: Input: [1,1,1,3,3,4,3,2,4,2] Output: true Company: Amazon Solution (Using Sorting): Time Complexity: O(n log n) Space Complexity: O(1)"
categories: ["Algorithms", "Programming", "LeetCode"]
tags: ["Algorithms", "Duplicates", "Arrays", "Programming"]
draft: false
---

### Contains Duplicate

[Link to original Problem on LeetCode](https://leetcode.com/problems/contains-duplicate/)

Given an array of integers, find if the array contains any duplicates.

Your function should return true if any value appears at least twice in the array, and it should return false if every element is distinct.

**Example 1**:

**Input**: \[1,2,3,1\]

**Output**: true

**Example 2**:

**Input**: \[1,2,3,4\]

**Output**: false

**Example 3**:

**Input**: \[1,1,1,3,3,4,3,2,4,2\]

**Output**: true

**Company:** *Amazon*

**Solution (Using Sorting):**

**Time Complexity:** O(n log n) **Space Complexity:** O(1)

```python
class Solution(object):
    def containsDuplicate(self, nums):
        """
        :type nums: List[int]
        :rtype: bool
        """
        # We know that if there are 1 or no element than we don't have any duplicate
        if len(nums) <= 1:
            return False
        
        # Sort the array
        nums.sort()
        
        # Check if any two adjacent elemets are same
        # If yes then return True, since duplicate element is present
        for i,num in enumerate(nums):
            if nums[i - 1] == num:
                return True
            
        return False
```

**Solution (Using Hashing):**

**Time Complexity:** O(n) **Space Complexity:** O(n)

```python
class Solution(object):
    def containsDuplicate(self, nums):
        """
        :type nums: List[int]
        :rtype: bool
        """
        # Maintain a set. For each element check whether it is already present in the set
        # If not then add it, else return True as we found that we already have same element
        unique = set()
        
        for num in nums:
            if num in unique:
                return True
            else:
                unique.add(num)
            
        return False
```
