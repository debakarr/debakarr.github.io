---
title: "[LeetCode] 169. Majority Element"
date: "2019-08-27"
description: "Majority Element Link to original Problem on LeetCode Given an array of size n, find the majority element. The majority element is the element that appears more than ⌊ n/2 ⌋ times. You may assume that the array is non-empty and the majority element always exist in the array. Example 1: Input: [3,2,3] Output: 3 Example 2: Input: [2,2,1,1,1,2,2] Output: 2 Company: Yahoo, Google, Amazon, Microsoft Solution (Using Hashing - 2 pass):"
categories: ["Algorithms", "Programming", "LeetCode"]
tags: ["Algorithms", "Majority Element", "Moore's Voting Algorithm", "Programming"]
draft: false
---

### Majority Element

[Link to original Problem on LeetCode](https://leetcode.com/problems/majority-element/)

Given an array of size n, find the majority element. The majority element is the element that appears more than **⌊ n/2 ⌋** times.

You may assume that the array is non-empty and the majority element always exist in the array.

**Example 1:**

**Input**: \[3,2,3\]

**Output**: 3

**Example 2:**

**Input**: \[2,2,1,1,1,2,2\]

**Output**: 2

**Company:** *Yahoo*, *Google*, *Amazon*, *Microsoft*

**Solution (Using Hashing - 2 pass):**

**Time Complexity:** O(n) **Space Complexity:** O(n)

```python
    class Solution(object):
    def majorityElement(self, nums):
        """
        :type nums: List[int]
        :rtype: int
        """

        # Here the solution is to keep a dictionary of values and there count in nums
        elementDict = {}
        halfLength = len(nums) // 2
        
        for num in nums:
            elementDict[num] = elementDict.get(num, 0) + 1
            
        # Then we can go through the dictionary and check for the value whose count is more than len(nums) / 2
        for key, value in elementDict.items():
            if value > halfLength:
                return key
```

**Solution (Using Hashing - 1 pass):**

**Time Complexity:** O(n) **Space Complexity:** O(n)

```python
class Solution(object):
    def majorityElement(self, nums):
        """
        :type nums: List[int]
        :rtype: int
        """
        elementDict = {}
        halfLength = len(nums) // 2
        
        for num in nums:
            elementDict[num] = elementDict.get(num, 0) + 1
            if elementDict[num] > halfLength:
                return num
```

**Solution (Sorting):**

**Time Complexity:** O(n log n) **Space Complexity:** O(1)

```python
class Solution(object):
    def majorityElement(self, nums):
        """
        :type nums: List[int]
        :rtype: int
        """
        # First sort the list
        nums.sort()
        
        # Now after sorting the element which is present in middle will be the majority element
        return nums[len(nums) / 2]
```
